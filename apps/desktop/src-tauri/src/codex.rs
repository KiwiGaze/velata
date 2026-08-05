use std::collections::{HashMap, VecDeque};
use std::env;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;

const CODEX_MODEL: &str = "gpt-5.3-codex-spark";
const CODEX_USER_PROMPT: &str = "Refine the draft provided through stdin.";
const TOMBSTONE_TTL: Duration = Duration::from_secs(60);
const MAX_TOMBSTONES: usize = 256;
const MAX_REQUEST_ID_BYTES: usize = 128;
const MAX_ACTIVE_RUNS: usize = 4;
const DISABLED_CODEX_FEATURES: &[&str] = &[
    "shell_tool",
    "unified_exec",
    "apps",
    "plugins",
    "remote_plugin",
    "multi_agent",
    "multi_agent_v2",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "image_generation",
    "in_app_browser",
    "goals",
    "hooks",
    "shell_snapshot",
    "memories",
    "skill_mcp_dependency_install",
    "workspace_dependencies",
    "code_mode_host",
    "auth_elicitation",
    "tool_call_mcp_elicitation",
    "tool_suggest",
];
static RUN_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy)]
struct RunLimits {
    deadline: Duration,
    signal_grace: Duration,
    poll_interval: Duration,
    max_developer_instructions_bytes: usize,
    max_input_bytes: usize,
    max_output_bytes: usize,
    max_diagnostic_bytes: usize,
}

impl Default for RunLimits {
    fn default() -> Self {
        Self {
            deadline: Duration::from_secs(30),
            signal_grace: Duration::from_secs(1),
            poll_interval: Duration::from_millis(25),
            max_developer_instructions_bytes: 64 * 1024,
            max_input_bytes: 4 * 1024 * 1024,
            max_output_bytes: 1024 * 1024,
            max_diagnostic_bytes: 64 * 1024,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineRequest {
    request_id: String,
    developer_instructions: String,
    input: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    request_id: String,
}

#[derive(Debug, Serialize)]
pub struct RefineResponse {
    text: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum CodexSparkErrorCode {
    InvalidRequest,
    TaskPromptTooLarge,
    InputTooLarge,
    CliNotFound,
    CliIncompatible,
    AuthRequired,
    ModelUnavailable,
    ExecutionFailed,
    TimedOut,
    Cancelled,
    OutputUnreadable,
    OutputEmpty,
    OutputTooLarge,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct CodexSparkError {
    code: CodexSparkErrorCode,
    message: &'static str,
}

impl CodexSparkError {
    const fn new(code: CodexSparkErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }

    const fn invalid_request() -> Self {
        Self::new(CodexSparkErrorCode::InvalidRequest, "Invalid request.")
    }

    const fn cancelled() -> Self {
        Self::new(CodexSparkErrorCode::Cancelled, "Refine cancelled.")
    }

    const fn timed_out() -> Self {
        Self::new(
            CodexSparkErrorCode::TimedOut,
            "Refine timed out after 30 seconds.",
        )
    }
}

#[derive(Debug)]
struct ActiveRun {
    cancelled: AtomicBool,
    process_group_id: Mutex<Option<i32>>,
}

impl ActiveRun {
    fn new() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            process_group_id: Mutex::new(None),
        }
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(process_group_id) = *lock_unpoisoned(&self.process_group_id) {
            signal_process_group(process_group_id, libc::SIGINT);
        }
    }
}

struct Tombstone {
    request_id: String,
    created_at: Instant,
}

#[derive(Default)]
struct RegistryState {
    is_closed: bool,
    active: HashMap<String, Arc<ActiveRun>>,
    tombstones: VecDeque<Tombstone>,
}

#[derive(Clone, Default)]
pub struct CodexRegistry {
    state: Arc<Mutex<RegistryState>>,
    empty: Arc<Condvar>,
}

impl CodexRegistry {
    fn register(&self, request_id: &str, now: Instant) -> Result<Arc<ActiveRun>, CodexSparkError> {
        validate_request_id(request_id)?;
        let mut state = lock_unpoisoned(&self.state);
        prune_tombstones(&mut state.tombstones, now);
        if state.is_closed || state.active.contains_key(request_id) {
            return Err(CodexSparkError::invalid_request());
        }
        if let Some(index) = state
            .tombstones
            .iter()
            .position(|tombstone| tombstone.request_id == request_id)
        {
            state.tombstones.remove(index);
            return Err(CodexSparkError::cancelled());
        }
        if state.active.len() >= MAX_ACTIVE_RUNS {
            return Err(execution_failed());
        }
        let run = Arc::new(ActiveRun::new());
        state.active.insert(request_id.to_owned(), Arc::clone(&run));
        Ok(run)
    }

    fn finish(&self, request_id: &str) {
        let mut state = lock_unpoisoned(&self.state);
        state.active.remove(request_id);
        if state.active.is_empty() {
            self.empty.notify_all();
        }
    }

    fn cancel(&self, request_id: &str, now: Instant) {
        let mut state = lock_unpoisoned(&self.state);
        prune_tombstones(&mut state.tombstones, now);
        if let Some(run) = state.active.get(request_id) {
            run.cancel();
            return;
        }
        if state.is_closed
            || request_id.is_empty()
            || request_id.len() > MAX_REQUEST_ID_BYTES
            || state
                .tombstones
                .iter()
                .any(|tombstone| tombstone.request_id == request_id)
        {
            return;
        }
        if state.tombstones.len() == MAX_TOMBSTONES {
            state.tombstones.pop_front();
        }
        state.tombstones.push_back(Tombstone {
            request_id: request_id.to_owned(),
            created_at: now,
        });
    }

    pub fn shutdown(&self, signal_grace: Duration) {
        let runs = {
            let mut state = lock_unpoisoned(&self.state);
            state.is_closed = true;
            state.tombstones.clear();
            state.active.values().cloned().collect::<Vec<_>>()
        };
        if runs.is_empty() {
            return;
        }
        for run in &runs {
            run.cancel();
        }
        thread::sleep(signal_grace);
        for run in &runs {
            if let Some(process_group_id) = *lock_unpoisoned(&run.process_group_id) {
                signal_process_group(process_group_id, libc::SIGKILL);
            }
        }
        let mut state = lock_unpoisoned(&self.state);
        while !state.active.is_empty() {
            state = self
                .empty
                .wait(state)
                .unwrap_or_else(|error| error.into_inner());
        }
    }
}

struct Registration<'a> {
    registry: &'a CodexRegistry,
    request_id: &'a str,
}

impl Drop for Registration<'_> {
    fn drop(&mut self) {
        self.registry.finish(self.request_id);
    }
}

struct RunDirectory(PathBuf);

impl Drop for RunDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn shutdown_codex(registry: &CodexRegistry) {
    registry.shutdown(RunLimits::default().signal_grace);
}

#[tauri::command]
pub async fn refine_with_codex_spark(
    request: RefineRequest,
    registry: State<'_, CodexRegistry>,
) -> Result<RefineResponse, CodexSparkError> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let text = run_refine(&registry, request, RunOptions::production())?;
        Ok(RefineResponse { text })
    })
    .await
    .unwrap_or_else(|_| Err(execution_failed()))
}

#[tauri::command]
pub fn cancel_codex_spark(request: CancelRequest, registry: State<'_, CodexRegistry>) {
    registry.cancel(&request.request_id, Instant::now());
}

#[derive(Clone)]
struct RunOptions {
    executable: Option<CodexExecutable>,
    temp_root: PathBuf,
    limits: RunLimits,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CodexExecutable {
    path: PathBuf,
    child_path: OsString,
}

impl RunOptions {
    fn production() -> Self {
        Self {
            executable: None,
            temp_root: env::temp_dir(),
            limits: RunLimits::default(),
        }
    }
}

fn run_refine(
    registry: &CodexRegistry,
    request: RefineRequest,
    options: RunOptions,
) -> Result<String, CodexSparkError> {
    validate_request(&request, options.limits)?;
    let active_run = registry.register(&request.request_id, Instant::now())?;
    let _registration = Registration {
        registry,
        request_id: &request.request_id,
    };
    if active_run.cancelled.load(Ordering::Acquire) {
        return Err(CodexSparkError::cancelled());
    }
    let executable = match options.executable {
        Some(executable) if is_runnable_codex(&executable) => executable,
        Some(_) => return Err(cli_not_found()),
        None => find_codex_executable().ok_or_else(cli_not_found)?,
    };
    let run_directory = create_run_directory(&options.temp_root).map_err(|_| execution_failed())?;
    let output_path = run_directory.0.join("final-message.md");
    let outcome = execute_process(
        &executable,
        &request.developer_instructions,
        request.input.into_bytes(),
        &output_path,
        &run_directory.0,
        Arc::clone(&active_run),
        options.limits,
    );
    match outcome? {
        ProcessOutcome::Exited(status, _) if status.success() => {
            read_final_output(&output_path, options.limits.max_output_bytes)
        }
        ProcessOutcome::Exited(_, diagnostics) => Err(classify_diagnostics(&diagnostics)),
        ProcessOutcome::Cancelled => Err(CodexSparkError::cancelled()),
        ProcessOutcome::TimedOut => Err(CodexSparkError::timed_out()),
    }
}

fn validate_request(request: &RefineRequest, limits: RunLimits) -> Result<(), CodexSparkError> {
    validate_request_id(&request.request_id)?;
    if request.developer_instructions.len() > limits.max_developer_instructions_bytes {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::TaskPromptTooLarge,
            "Refine instruction is too large.",
        ));
    }
    if request.input.len() > limits.max_input_bytes {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::InputTooLarge,
            "Draft is too large.",
        ));
    }
    Ok(())
}

fn validate_request_id(request_id: &str) -> Result<(), CodexSparkError> {
    if request_id.is_empty() || request_id.len() > MAX_REQUEST_ID_BYTES {
        Err(CodexSparkError::invalid_request())
    } else {
        Ok(())
    }
}

fn find_codex_executable() -> Option<CodexExecutable> {
    let path = env::var_os("PATH");
    let home = env::var_os("HOME").map(PathBuf::from);
    resolve_codex_executable(
        path.as_deref(),
        home.as_deref(),
        &[
            PathBuf::from("/opt/homebrew/bin/codex"),
            PathBuf::from("/usr/local/bin/codex"),
        ],
    )
}

fn resolve_codex_executable(
    path: Option<&OsStr>,
    home: Option<&Path>,
    system_candidates: &[PathBuf],
) -> Option<CodexExecutable> {
    let inherited_directories = path
        .map(env::split_paths)
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let nvm_version_directories = home.map(find_nvm_version_directories).unwrap_or_default();
    let mut candidates = Vec::new();
    candidates.extend(
        inherited_directories
            .iter()
            .map(|directory| directory.join("codex")),
    );
    if let Some(home) = home {
        candidates.extend([
            home.join(".bun/bin/codex"),
            home.join(".local/bin/codex"),
            home.join(".npm-global/bin/codex"),
            home.join(".volta/bin/codex"),
            home.join(".asdf/shims/codex"),
            home.join(".local/share/mise/shims/codex"),
            home.join(".local/share/fnm/aliases/default/bin/codex"),
        ]);
        candidates.extend(
            nvm_version_directories
                .iter()
                .map(|directory| directory.join("codex")),
        );
    }
    candidates.extend(system_candidates.iter().cloned());
    let runtime_directories =
        find_supported_node_directories(home, system_candidates, &nvm_version_directories);
    candidates.into_iter().find_map(|candidate| {
        resolve_codex_candidate(&candidate, &inherited_directories, &runtime_directories)
    })
}

fn find_nvm_version_directories(home: &Path) -> Vec<PathBuf> {
    let versions_directory = home.join(".nvm/versions/node");
    let Ok(entries) = fs::read_dir(&versions_directory) else {
        return Vec::new();
    };
    let mut versions = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let version = parse_node_version(&entry.file_name())?;
            Some((version, entry.path().join("bin")))
        })
        .collect::<Vec<_>>();
    versions.sort_unstable_by_key(|candidate| std::cmp::Reverse(candidate.0));
    versions.into_iter().map(|(_, path)| path).collect()
}

fn find_supported_node_directories(
    home: Option<&Path>,
    system_candidates: &[PathBuf],
    nvm_version_directories: &[PathBuf],
) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Some(home) = home {
        directories.extend([
            home.join(".volta/bin"),
            home.join(".asdf/shims"),
            home.join(".local/share/mise/shims"),
            home.join(".local/share/fnm/aliases/default/bin"),
        ]);
        directories.extend(nvm_version_directories.iter().cloned());
    }
    directories.extend(
        system_candidates
            .iter()
            .filter_map(|candidate| candidate.parent().map(Path::to_owned)),
    );
    directories.retain(|directory| is_executable_file(&directory.join("node")));
    directories
}

fn resolve_codex_candidate(
    candidate: &Path,
    inherited_directories: &[PathBuf],
    runtime_directories: &[PathBuf],
) -> Option<CodexExecutable> {
    if !is_executable_file(candidate) {
        return None;
    }
    let child_directories = child_path_directories(
        candidate.parent(),
        inherited_directories,
        runtime_directories,
    );
    if is_env_node_launcher(candidate)
        && !child_directories
            .iter()
            .any(|directory| is_executable_file(&directory.join("node")))
    {
        return None;
    }
    let child_path = env::join_paths(child_directories).ok()?;
    Some(CodexExecutable {
        path: candidate.to_owned(),
        child_path,
    })
}

fn child_path_directories(
    launcher_directory: Option<&Path>,
    inherited_directories: &[PathBuf],
    runtime_directories: &[PathBuf],
) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Some(launcher_directory) = launcher_directory {
        directories.push(launcher_directory.to_owned());
    }
    for directory in inherited_directories.iter().chain(runtime_directories) {
        if !directories.contains(directory) {
            directories.push(directory.clone());
        }
    }
    directories
}

fn is_env_node_launcher(path: &Path) -> bool {
    let Ok(file) = File::open(path) else {
        return false;
    };
    let mut bytes = Vec::new();
    if file.take(128).read_to_end(&mut bytes).is_err() {
        return false;
    }
    String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .is_some_and(|line| line.trim_end() == "#!/usr/bin/env node")
}

fn is_runnable_codex(executable: &CodexExecutable) -> bool {
    is_executable_file(&executable.path)
        && (!is_env_node_launcher(&executable.path)
            || env::split_paths(&executable.child_path)
                .any(|directory| is_executable_file(&directory.join("node"))))
}

fn parse_node_version(version: &OsStr) -> Option<(u64, u64, u64)> {
    let version = version.to_str()?.strip_prefix('v')?;
    let mut parts = version.split('.');
    let parsed = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(parsed)
}

fn is_executable_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

fn create_run_directory(temp_root: &Path) -> io::Result<RunDirectory> {
    for _ in 0..100 {
        let sequence = RUN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = temp_root.join(format!("velata-codex-{}-{sequence}", std::process::id()));
        let mut builder = fs::DirBuilder::new();
        builder.mode(0o700);
        match builder.create(&path) {
            Ok(()) => return Ok(RunDirectory(path)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not create private run directory",
    ))
}

enum ProcessOutcome {
    Exited(ExitStatus, ProcessDiagnostics),
    Cancelled,
    TimedOut,
}

#[derive(Default)]
struct ProcessDiagnostics {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn execute_process(
    executable: &CodexExecutable,
    developer_instructions: &str,
    input: Vec<u8>,
    output_path: &Path,
    run_directory: &Path,
    active_run: Arc<ActiveRun>,
    limits: RunLimits,
) -> Result<ProcessOutcome, CodexSparkError> {
    let mut command = Command::new(&executable.path);
    command
        .args(build_arguments(output_path, developer_instructions)?)
        .current_dir(run_directory)
        .env("PATH", &executable.child_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    let mut child = command.spawn().map_err(|_| cli_not_found())?;
    let child_pid = match i32::try_from(child.id()) {
        Ok(child_pid) => child_pid,
        Err(_) => {
            terminate_child(&mut child);
            return Err(execution_failed());
        }
    };
    let process_group_id = match get_process_group_id(child_pid) {
        Some(process_group_id) => process_group_id,
        None => {
            terminate_child(&mut child);
            return Err(execution_failed());
        }
    };
    if process_group_id != child_pid || process_group_id == get_process_group_id(0).unwrap_or(-1) {
        terminate_child(&mut child);
        return Err(execution_failed());
    }
    *lock_unpoisoned(&active_run.process_group_id) = Some(process_group_id);

    let stdout = Arc::new(Mutex::new(Vec::new()));
    let stderr = Arc::new(Mutex::new(Vec::new()));
    let stdout_thread = spawn_drain(
        child.stdout.take().expect("stdout is configured as piped"),
        Arc::clone(&stdout),
        limits.max_diagnostic_bytes,
    );
    let stderr_thread = spawn_drain(
        child.stderr.take().expect("stderr is configured as piped"),
        Arc::clone(&stderr),
        limits.max_diagnostic_bytes,
    );
    let mut stdin = child.stdin.take().expect("stdin is configured as piped");
    let stdin_thread = thread::spawn(move || {
        let _ = stdin.write_all(&input);
    });

    let started_at = Instant::now();
    let mut is_wrapper_reaped = false;
    let process_result = loop {
        if active_run.cancelled.load(Ordering::Acquire) {
            break Ok(ProcessOutcome::Cancelled);
        }
        if started_at.elapsed() >= limits.deadline {
            break Ok(ProcessOutcome::TimedOut);
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                is_wrapper_reaped = true;
                break Ok(ProcessOutcome::Exited(
                    status,
                    ProcessDiagnostics::default(),
                ));
            }
            Ok(None) => thread::sleep(limits.poll_interval),
            Err(_) => break Err(execution_failed()),
        }
    };
    cleanup_process_group(&mut child, process_group_id, is_wrapper_reaped, limits);
    *lock_unpoisoned(&active_run.process_group_id) = None;
    join_io_threads(stdin_thread, stdout_thread, stderr_thread);
    let diagnostics = ProcessDiagnostics {
        stdout: std::mem::take(&mut *lock_unpoisoned(&stdout)),
        stderr: std::mem::take(&mut *lock_unpoisoned(&stderr)),
    };
    if active_run.cancelled.load(Ordering::Acquire) {
        return Ok(ProcessOutcome::Cancelled);
    }
    let outcome = process_result?;
    Ok(match outcome {
        ProcessOutcome::Exited(status, _) => ProcessOutcome::Exited(status, diagnostics),
        other => other,
    })
}

fn build_arguments(
    output_path: &Path,
    developer_instructions: &str,
) -> Result<Vec<OsString>, CodexSparkError> {
    let developer_instructions =
        serde_json::to_string(developer_instructions).map_err(|_| execution_failed())?;
    let mut arguments = vec![
        OsString::from("exec"),
        OsString::from("--ephemeral"),
        OsString::from("--strict-config"),
        OsString::from("--ignore-user-config"),
        OsString::from("--ignore-rules"),
        OsString::from("--sandbox"),
        OsString::from("read-only"),
        OsString::from("--skip-git-repo-check"),
        OsString::from("--model"),
        OsString::from(CODEX_MODEL),
        OsString::from("-c"),
        OsString::from("model_reasoning_effort=\"low\""),
        OsString::from("-c"),
        OsString::from(format!("developer_instructions={developer_instructions}")),
        OsString::from("-c"),
        OsString::from("approval_policy=\"never\""),
        OsString::from("-c"),
        OsString::from("web_search=\"disabled\""),
        OsString::from("-c"),
        OsString::from("project_doc_max_bytes=0"),
        OsString::from("-c"),
        OsString::from("agents.enabled=false"),
    ];
    for &feature in DISABLED_CODEX_FEATURES {
        arguments.push(OsString::from("--disable"));
        arguments.push(OsString::from(feature));
    }
    arguments.extend([
        OsString::from("--color"),
        OsString::from("never"),
        OsString::from("--output-last-message"),
        output_path.as_os_str().to_owned(),
        OsString::from(CODEX_USER_PROMPT),
    ]);
    Ok(arguments)
}

fn spawn_drain(
    mut pipe: impl Read + Send + 'static,
    diagnostics: Arc<Mutex<Vec<u8>>>,
    limit: usize,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            let Ok(count) = pipe.read(&mut buffer) else {
                return;
            };
            if count == 0 {
                return;
            }
            let mut captured = lock_unpoisoned(&diagnostics);
            let remaining = limit.saturating_sub(captured.len());
            captured.extend_from_slice(&buffer[..count.min(remaining)]);
        }
    })
}

fn join_io_threads(
    stdin_thread: thread::JoinHandle<()>,
    stdout_thread: thread::JoinHandle<()>,
    stderr_thread: thread::JoinHandle<()>,
) {
    let _ = stdin_thread.join();
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();
}

fn cleanup_process_group(
    child: &mut Child,
    process_group_id: i32,
    mut is_wrapper_reaped: bool,
    limits: RunLimits,
) {
    signal_process_group(process_group_id, libc::SIGINT);
    let grace_started_at = Instant::now();
    while grace_started_at.elapsed() < limits.signal_grace {
        if !is_wrapper_reaped {
            match child.try_wait() {
                Ok(Some(_)) => is_wrapper_reaped = true,
                Ok(None) => {}
                Err(_) => break,
            }
        }
        if !process_group_exists(process_group_id) {
            break;
        }
        thread::sleep(limits.poll_interval);
    }
    if process_group_exists(process_group_id) {
        signal_process_group(process_group_id, libc::SIGKILL);
    }
    if !is_wrapper_reaped {
        let _ = child.wait();
    }
}

fn terminate_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn signal_process_group(process_group_id: i32, signal: i32) {
    if process_group_id > 0 {
        unsafe {
            libc::kill(-process_group_id, signal);
        }
    }
}

fn get_process_group_id(process_id: i32) -> Option<i32> {
    let process_group_id = unsafe { libc::getpgid(process_id) };
    (process_group_id > 0).then_some(process_group_id)
}

fn process_group_exists(process_group_id: i32) -> bool {
    if process_group_id <= 0 {
        return false;
    }
    let result = unsafe { libc::kill(-process_group_id, 0) };
    result == 0 || io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

fn read_final_output(path: &Path, max_bytes: usize) -> Result<String, CodexSparkError> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW)
        .open(path)
        .map_err(|_| output_unreadable())?;
    let metadata = file.metadata().map_err(|_| output_unreadable())?;
    if !metadata.file_type().is_file() {
        return Err(output_unreadable());
    }
    if metadata.len() > max_bytes as u64 {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::OutputTooLarge,
            "Codex response is too large.",
        ));
    }
    let mut bytes = Vec::new();
    file.take((max_bytes + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| output_unreadable())?;
    if bytes.len() > max_bytes {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::OutputTooLarge,
            "Codex response is too large.",
        ));
    }
    let text = String::from_utf8(bytes).map_err(|_| output_unreadable())?;
    let text = text.trim();
    if text.is_empty() {
        Err(CodexSparkError::new(
            CodexSparkErrorCode::OutputEmpty,
            "Codex returned empty output.",
        ))
    } else {
        Ok(text.to_owned())
    }
}

fn classify_diagnostics(diagnostics: &ProcessDiagnostics) -> CodexSparkError {
    classify_diagnostic_stream(&diagnostics.stderr)
        .or_else(|| classify_diagnostic_stream(&diagnostics.stdout))
        .unwrap_or_else(execution_failed)
}

fn classify_diagnostic_stream(diagnostics: &[u8]) -> Option<CodexSparkError> {
    let diagnostics = String::from_utf8_lossy(diagnostics).to_ascii_lowercase();
    if [
        "codex login",
        "not logged in",
        "authentication",
        "unauthorized",
        "401",
    ]
    .iter()
    .any(|pattern| diagnostics.contains(pattern))
    {
        return Some(CodexSparkError::new(
            CodexSparkErrorCode::AuthRequired,
            "Run `codex login`.",
        ));
    }
    if diagnostics.contains("model")
        && [
            "unavailable",
            "not available",
            "entitlement",
            "access",
            "not found",
            "not supported",
            "does not exist",
        ]
        .iter()
        .any(|pattern| diagnostics.contains(pattern))
    {
        return Some(CodexSparkError::new(
            CodexSparkErrorCode::ModelUnavailable,
            "Codex Spark is unavailable for this account.",
        ));
    }
    if [
        "unexpected argument",
        "unknown option",
        "unknown flag",
        "unrecognized option",
    ]
    .iter()
    .any(|pattern| diagnostics.contains(pattern))
    {
        return Some(CodexSparkError::new(
            CodexSparkErrorCode::CliIncompatible,
            "Update the Codex CLI.",
        ));
    }
    None
}

fn cli_not_found() -> CodexSparkError {
    CodexSparkError::new(
        CodexSparkErrorCode::CliNotFound,
        "Install or update the Codex CLI.",
    )
}

fn execution_failed() -> CodexSparkError {
    CodexSparkError::new(CodexSparkErrorCode::ExecutionFailed, "Refine failed.")
}

fn output_unreadable() -> CodexSparkError {
    CodexSparkError::new(
        CodexSparkErrorCode::OutputUnreadable,
        "Could not read the refined output.",
    )
}

fn prune_tombstones(tombstones: &mut VecDeque<Tombstone>, now: Instant) {
    tombstones.retain(|tombstone| now.duration_since(tombstone.created_at) < TOMBSTONE_TTL);
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::sync::mpsc;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const FIFO_CHILD_PATH_ENV: &str = "VELATA_CODEX_FIFO_CHILD_PATH";
    const FIFO_CHILD_SUCCESS_PATH_ENV: &str = "VELATA_CODEX_FIFO_CHILD_SUCCESS_PATH";
    const FIFO_TEST_NAME: &str =
        "codex::tests::final_output_rejects_symlinks_and_fifos_without_blocking";
    const TEST_WAIT_TIMEOUT: Duration = Duration::from_secs(15);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "velata-codex-test-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_script(directory: &Path, name: &str, body: &str) -> PathBuf {
        let path = directory.join(name);
        fs::write(&path, format!("#!/bin/sh\nset -eu\n{body}\n")).expect("write fake executable");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .expect("make fake executable runnable");
        path
    }

    fn write_executable(path: &Path) {
        write_executable_contents(path, "#!/bin/sh\n");
    }

    fn write_executable_contents(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().expect("executable has a parent"))
            .expect("create executable directory");
        fs::write(path, contents).expect("write executable");
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).expect("make file executable");
    }

    fn request(request_id: &str, developer_instructions: &str, input: &str) -> RefineRequest {
        RefineRequest {
            request_id: request_id.to_owned(),
            developer_instructions: developer_instructions.to_owned(),
            input: input.to_owned(),
        }
    }

    fn options(executable: PathBuf, temp_root: &Path) -> RunOptions {
        let inherited_path = env::var_os("PATH");
        let inherited_directories = inherited_path
            .as_deref()
            .map(env::split_paths)
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        let home = env::var_os("HOME").map(PathBuf::from);
        let nvm_version_directories = home
            .as_deref()
            .map(find_nvm_version_directories)
            .unwrap_or_default();
        let runtime_directories = find_supported_node_directories(
            home.as_deref(),
            &[
                PathBuf::from("/opt/homebrew/bin/codex"),
                PathBuf::from("/usr/local/bin/codex"),
            ],
            &nvm_version_directories,
        );
        let child_path = env::join_paths(child_path_directories(
            executable.parent(),
            &inherited_directories,
            &runtime_directories,
        ))
        .expect("build test child PATH");
        RunOptions {
            executable: Some(CodexExecutable {
                path: executable,
                child_path,
            }),
            temp_root: temp_root.to_owned(),
            limits: RunLimits {
                deadline: Duration::from_secs(10),
                signal_grace: Duration::from_millis(40),
                poll_interval: Duration::from_millis(5),
                max_developer_instructions_bytes: 1024,
                max_input_bytes: 512 * 1024,
                max_output_bytes: 1024,
                max_diagnostic_bytes: 1024,
            },
        }
    }

    fn run_direct(
        registry: &CodexRegistry,
        executable: PathBuf,
        temp_root: &Path,
        request: RefineRequest,
    ) -> Result<String, CodexSparkError> {
        run_refine(registry, request, options(executable, temp_root))
    }

    fn assert_no_run_directories(directory: &Path) {
        let has_run_directory = fs::read_dir(directory)
            .expect("read test directory")
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("velata-codex-")
            });
        assert!(!has_run_directory);
    }

    fn wait_for_process_group(registry: &CodexRegistry, request_id: &str) -> i32 {
        let started_at = Instant::now();
        loop {
            let run = lock_unpoisoned(&registry.state)
                .active
                .get(request_id)
                .cloned();
            if let Some(process_group_id) = run
                .as_ref()
                .and_then(|run| *lock_unpoisoned(&run.process_group_id))
            {
                return process_group_id;
            }
            assert!(started_at.elapsed() < TEST_WAIT_TIMEOUT);
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn assert_process_is_gone(process_id: i32) {
        let started_at = Instant::now();
        loop {
            let result = unsafe { libc::kill(process_id, 0) };
            if result == -1 && io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                return;
            }
            assert!(started_at.elapsed() < TEST_WAIT_TIMEOUT);
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn wait_for_process_id(path: &Path) -> i32 {
        let started_at = Instant::now();
        loop {
            if let Ok(process_id) = fs::read_to_string(path) {
                return process_id.parse().expect("parse process id");
            }
            assert!(started_at.elapsed() < TEST_WAIT_TIMEOUT);
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn finder_discovery_preserves_path_home_nvm_and_system_precedence() {
        let directory = TestDirectory::new();
        let path_directory = directory.path().join("path-bin");
        let path_codex = path_directory.join("codex");
        let home_codex = directory.path().join(".bun/bin/codex");
        let nvm_codex = directory
            .path()
            .join(".nvm/versions/node/v24.12.0/bin/codex");
        let system_codex = directory.path().join("system/codex");
        for executable in [&path_codex, &home_codex, &nvm_codex, &system_codex] {
            write_executable(executable);
        }
        let path = env::join_paths([&path_directory]).expect("join PATH");

        assert_eq!(
            resolve_codex_executable(
                Some(&path),
                Some(directory.path()),
                std::slice::from_ref(&system_codex),
            )
            .map(|executable| executable.path),
            Some(path_codex.clone())
        );
        fs::remove_file(&path_codex).expect("remove PATH executable");
        assert_eq!(
            resolve_codex_executable(
                Some(&path),
                Some(directory.path()),
                std::slice::from_ref(&system_codex),
            )
            .map(|executable| executable.path),
            Some(home_codex.clone())
        );
        fs::remove_file(&home_codex).expect("remove home executable");
        assert_eq!(
            resolve_codex_executable(
                Some(&path),
                Some(directory.path()),
                std::slice::from_ref(&system_codex),
            )
            .map(|executable| executable.path),
            Some(nvm_codex.clone())
        );
        fs::remove_file(&nvm_codex).expect("remove NVM executable");
        assert_eq!(
            resolve_codex_executable(
                Some(&path),
                Some(directory.path()),
                std::slice::from_ref(&system_codex),
            )
            .map(|executable| executable.path),
            Some(system_codex)
        );
    }

    #[test]
    fn run_directory_uses_private_permissions() {
        let directory = TestDirectory::new();
        let run_directory =
            create_run_directory(directory.path()).expect("create private run directory");
        let permissions = fs::metadata(&run_directory.0)
            .expect("read run directory metadata")
            .permissions()
            .mode();

        assert_eq!(permissions & 0o777, 0o700);

        drop(run_directory);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn finder_discovery_accepts_each_fixed_version_manager_layout() {
        for relative_path in [
            ".volta/bin/codex",
            ".asdf/shims/codex",
            ".local/share/mise/shims/codex",
            ".local/share/fnm/aliases/default/bin/codex",
        ] {
            let directory = TestDirectory::new();
            let executable = directory.path().join(relative_path);
            write_executable(&executable);

            assert_eq!(
                resolve_codex_executable(None, Some(directory.path()), &[])
                    .map(|executable| executable.path),
                Some(executable),
                "failed to discover {relative_path}"
            );
        }
    }

    #[test]
    fn finder_discovery_requires_an_executable_file() {
        let directory = TestDirectory::new();
        let path_directory = directory.path().join("path-bin");
        fs::create_dir_all(path_directory.join("codex")).expect("create directory candidate");
        let non_executable = directory.path().join(".bun/bin/codex");
        fs::create_dir_all(non_executable.parent().expect("candidate has a parent"))
            .expect("create non-executable directory");
        fs::write(&non_executable, "not executable").expect("write non-executable candidate");
        let executable = directory.path().join(".local/bin/codex");
        write_executable(&executable);
        let path = env::join_paths([&path_directory]).expect("join PATH");

        assert_eq!(
            resolve_codex_executable(Some(&path), Some(directory.path()), &[])
                .map(|executable| executable.path),
            Some(executable)
        );
    }

    #[test]
    fn finder_discovery_chooses_the_latest_executable_semantic_nvm_version() {
        let directory = TestDirectory::new();
        let older = directory
            .path()
            .join(".nvm/versions/node/v22.15.0/bin/codex");
        let latest = directory
            .path()
            .join(".nvm/versions/node/v24.2.1/bin/codex");
        let invalid = directory.path().join(".nvm/versions/node/latest/bin/codex");
        let non_executable_newer = directory
            .path()
            .join(".nvm/versions/node/v25.0.0/bin/codex");
        for executable in [&older, &latest, &invalid] {
            write_executable(executable);
        }
        fs::create_dir_all(
            non_executable_newer
                .parent()
                .expect("candidate has a parent"),
        )
        .expect("create non-executable NVM directory");
        fs::write(&non_executable_newer, "not executable")
            .expect("write non-executable NVM candidate");

        assert_eq!(
            resolve_codex_executable(None, Some(directory.path()), &[])
                .map(|executable| executable.path),
            Some(latest)
        );
    }

    #[test]
    fn finder_discovery_skips_an_env_node_launcher_without_node() {
        let directory = TestDirectory::new();
        let inherited_directory = directory.path().join("finder-path");
        fs::create_dir(&inherited_directory).expect("create Finder PATH directory");
        let unsupported_launcher = directory.path().join(".bun/bin/codex");
        write_executable_contents(&unsupported_launcher, "#!/usr/bin/env node\n");
        let absolute_interpreter_launcher = directory.path().join(".local/bin/codex");
        write_executable(&absolute_interpreter_launcher);
        let path = env::join_paths([&inherited_directory]).expect("join Finder PATH");

        assert_eq!(
            resolve_codex_executable(Some(&path), Some(directory.path()), &[])
                .map(|executable| executable.path),
            Some(absolute_interpreter_launcher)
        );
    }

    #[test]
    fn finder_execution_supplies_a_supported_node_runtime_to_an_env_launcher() {
        let directory = TestDirectory::new();
        let inherited_directory = directory.path().join("finder-path");
        fs::create_dir(&inherited_directory).expect("create Finder PATH directory");
        let launcher = directory.path().join(".local/bin/codex");
        let node = directory.path().join(".volta/bin/node");
        let node_marker = directory.path().join("node-invoked");
        write_executable_contents(
            &node,
            &format!(
                "#!/bin/sh\nprintf 'invoked' > '{}'\nexec /bin/sh \"$@\"\n",
                node_marker.display()
            ),
        );
        write_executable_contents(
            &launcher,
            r#"#!/usr/bin/env node
set -eu
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
printf 'Finder execution passed' > "$output"
"#,
        );
        let path = env::join_paths([&inherited_directory]).expect("join Finder PATH");
        let executable = resolve_codex_executable(Some(&path), Some(directory.path()), &[])
            .expect("resolve env-node launcher");
        assert_eq!(executable.path, launcher);
        assert_eq!(
            env::split_paths(&executable.child_path).collect::<Vec<_>>(),
            vec![
                directory.path().join(".local/bin"),
                inherited_directory,
                directory.path().join(".volta/bin"),
            ]
        );
        let mut run_options = options(executable.path.clone(), directory.path());
        run_options.executable = Some(executable);

        let text = run_refine(
            &CodexRegistry::default(),
            request("finder-env-node", "task", "input"),
            run_options,
        )
        .expect("run env-node launcher");

        assert_eq!(text, "Finder execution passed");
        assert_eq!(
            fs::read_to_string(node_marker).expect("read node invocation marker"),
            "invoked"
        );
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn command_arguments_are_strict_tool_free_and_ordered() {
        let output_path = Path::new("/private/run/final-message.md");
        let arguments = build_arguments(
            output_path,
            "Trusted \"instruction\".\nBackslash: \\\\; Unicode: 中文",
        )
        .expect("build command arguments");

        assert_eq!(
            arguments,
            vec![
                OsString::from("exec"),
                OsString::from("--ephemeral"),
                OsString::from("--strict-config"),
                OsString::from("--ignore-user-config"),
                OsString::from("--ignore-rules"),
                OsString::from("--sandbox"),
                OsString::from("read-only"),
                OsString::from("--skip-git-repo-check"),
                OsString::from("--model"),
                OsString::from("gpt-5.3-codex-spark"),
                OsString::from("-c"),
                OsString::from("model_reasoning_effort=\"low\""),
                OsString::from("-c"),
                OsString::from(
                    "developer_instructions=\"Trusted \\\"instruction\\\".\\nBackslash: \\\\\\\\; Unicode: 中文\"",
                ),
                OsString::from("-c"),
                OsString::from("approval_policy=\"never\""),
                OsString::from("-c"),
                OsString::from("web_search=\"disabled\""),
                OsString::from("-c"),
                OsString::from("project_doc_max_bytes=0"),
                OsString::from("-c"),
                OsString::from("agents.enabled=false"),
                OsString::from("--disable"),
                OsString::from("shell_tool"),
                OsString::from("--disable"),
                OsString::from("unified_exec"),
                OsString::from("--disable"),
                OsString::from("apps"),
                OsString::from("--disable"),
                OsString::from("plugins"),
                OsString::from("--disable"),
                OsString::from("remote_plugin"),
                OsString::from("--disable"),
                OsString::from("multi_agent"),
                OsString::from("--disable"),
                OsString::from("multi_agent_v2"),
                OsString::from("--disable"),
                OsString::from("browser_use"),
                OsString::from("--disable"),
                OsString::from("browser_use_external"),
                OsString::from("--disable"),
                OsString::from("browser_use_full_cdp_access"),
                OsString::from("--disable"),
                OsString::from("computer_use"),
                OsString::from("--disable"),
                OsString::from("image_generation"),
                OsString::from("--disable"),
                OsString::from("in_app_browser"),
                OsString::from("--disable"),
                OsString::from("goals"),
                OsString::from("--disable"),
                OsString::from("hooks"),
                OsString::from("--disable"),
                OsString::from("shell_snapshot"),
                OsString::from("--disable"),
                OsString::from("memories"),
                OsString::from("--disable"),
                OsString::from("skill_mcp_dependency_install"),
                OsString::from("--disable"),
                OsString::from("workspace_dependencies"),
                OsString::from("--disable"),
                OsString::from("code_mode_host"),
                OsString::from("--disable"),
                OsString::from("auth_elicitation"),
                OsString::from("--disable"),
                OsString::from("tool_call_mcp_elicitation"),
                OsString::from("--disable"),
                OsString::from("tool_suggest"),
                OsString::from("--color"),
                OsString::from("never"),
                OsString::from("--output-last-message"),
                output_path.as_os_str().to_owned(),
                OsString::from(CODEX_USER_PROMPT),
            ]
        );
    }

    #[test]
    fn command_uses_a_fixed_prompt_and_keeps_the_hostile_draft_on_stdin() {
        let directory = TestDirectory::new();
        let script = write_script(
            directory.path(),
            "codex",
            r#"
args_file="$(dirname "$0")/args"
stdin_file="$(dirname "$0")/stdin"
pgid_file="$(dirname "$0")/pgid"
cwd_file="$(dirname "$0")/cwd"
: > "$args_file"
output=""
while [ "$#" -gt 0 ]; do
  printf '%s\n' "$1" >> "$args_file"
  if [ "$1" = "--output-last-message" ]; then
    shift
    output="$1"
  fi
  shift
done
cat > "$stdin_file"
pwd > "$cwd_file"
printf '%s' "$$" > "$pgid_file"
printf 'progress, not output\n' >&1
printf 'diagnostic, not output\n' >&2
printf '  final **text**  \n' > "$output"
"#,
        );
        let hostile_input = "$(touch should-not-run); raw draft";

        let text = run_direct(
            &CodexRegistry::default(),
            script,
            directory.path(),
            request(
                "request-1",
                "Trusted \"instruction\".\nBackslash: \\\\; Unicode: 中文",
                hostile_input,
            ),
        )
        .expect("fake Codex run succeeds");

        assert_eq!(text, "final **text**");
        let arguments = fs::read_to_string(directory.path().join("args")).expect("read args");
        assert!(arguments
            .contains("exec\n--ephemeral\n--strict-config\n--ignore-user-config\n--ignore-rules"));
        assert!(arguments.contains("--sandbox\nread-only"));
        assert!(arguments.contains("--model\ngpt-5.3-codex-spark"));
        assert!(arguments.contains("-c\nmodel_reasoning_effort=\"low\""));
        assert!(arguments.contains(
            "-c\ndeveloper_instructions=\"Trusted \\\"instruction\\\".\\nBackslash: \\\\\\\\; Unicode: 中文\""
        ));
        assert!(arguments.contains("-c\napproval_policy=\"never\""));
        assert!(arguments.contains("-c\nweb_search=\"disabled\""));
        assert!(arguments.contains("-c\nproject_doc_max_bytes=0"));
        assert!(arguments.contains("-c\nagents.enabled=false"));
        for feature in [
            "shell_tool",
            "unified_exec",
            "apps",
            "plugins",
            "remote_plugin",
            "multi_agent",
            "multi_agent_v2",
            "browser_use",
            "browser_use_external",
            "browser_use_full_cdp_access",
            "computer_use",
            "image_generation",
            "in_app_browser",
            "goals",
            "hooks",
            "shell_snapshot",
            "memories",
            "skill_mcp_dependency_install",
            "workspace_dependencies",
            "code_mode_host",
            "auth_elicitation",
            "tool_call_mcp_elicitation",
            "tool_suggest",
        ] {
            assert!(arguments.contains(&format!("--disable\n{feature}\n")));
        }
        assert!(arguments.contains("--color\nnever"));
        assert!(arguments.contains("--output-last-message\n"));
        assert!(arguments.ends_with(&format!("{CODEX_USER_PROMPT}\n")));
        assert!(!arguments.contains(hostile_input));
        assert!(!arguments.contains("--json"));
        assert_eq!(
            fs::read_to_string(directory.path().join("stdin")).expect("read stdin"),
            hostile_input
        );
        let command_working_directory = PathBuf::from(
            fs::read_to_string(directory.path().join("cwd"))
                .expect("read command working directory")
                .trim(),
        );
        let canonical_test_directory = directory
            .path()
            .canonicalize()
            .expect("canonicalize test directory");
        assert_eq!(
            command_working_directory.parent(),
            Some(canonical_test_directory.as_path())
        );
        assert!(command_working_directory
            .file_name()
            .expect("run directory has a name")
            .to_string_lossy()
            .starts_with("velata-codex-"));
        let child_process_group: i32 = fs::read_to_string(directory.path().join("pgid"))
            .expect("read process group")
            .trim()
            .parse()
            .expect("parse process group");
        assert_ne!(child_process_group, unsafe { libc::getpgrp() });
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn diagnostic_capture_discards_bytes_after_the_configured_prefix() {
        let diagnostics = Arc::new(Mutex::new(Vec::new()));
        let drain = spawn_drain(
            io::Cursor::new(vec![b'x'; 1025]),
            Arc::clone(&diagnostics),
            1024,
        );

        drain.join().expect("diagnostic drain does not panic");

        assert_eq!(lock_unpoisoned(&diagnostics).len(), 1024);
    }

    #[test]
    fn concurrent_pipes_and_stdin_complete_without_deadlock() {
        let directory = TestDirectory::new();
        let script = write_script(
            directory.path(),
            "codex",
            r#"
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
i=0
while [ "$i" -lt 3000 ]; do
  printf 'stdout pressure line %s xxxxxxxxxxxxxxxxxxxxxxxx\n' "$i"
  printf 'stderr pressure line %s xxxxxxxxxxxxxxxxxxxxxxxx\n' "$i" >&2
  i=$((i + 1))
done
cat >/dev/null
printf 'pipe pressure passed' > "$output"
"#,
        );
        let input = "i".repeat(256 * 1024);

        let text = run_direct(
            &CodexRegistry::default(),
            script,
            directory.path(),
            request("pipe-pressure", "task", &input),
        )
        .expect("pipe pressure run succeeds");

        assert_eq!(text, "pipe pressure passed");
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn successful_wrapper_cleans_up_stubborn_descendant_holding_pipes() {
        let directory = TestDirectory::new();
        let descendant_path = directory.path().join("descendant-pid");
        let release_path = directory.path().join("release-wrapper");
        let script = write_script(
            directory.path(),
            "codex",
            &format!(
                r#"
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
cat >/dev/null
sh -c 'trap "" INT; printf "%s" "$$" > "{}"; while :; do sleep 1; done' &
while [ ! -s "{}" ]; do sleep 0.01; done
while [ ! -e "{}" ]; do sleep 0.01; done
printf 'accepted output' > "$output"
"#,
                descendant_path.display(),
                descendant_path.display(),
                release_path.display()
            ),
        );
        let mut run_options = options(script, directory.path());
        run_options.limits.signal_grace = Duration::from_millis(40);
        let registry = CodexRegistry::default();
        let worker_registry = registry.clone();
        let (sender, receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            let result = run_refine(
                &worker_registry,
                request("successful-descendant", "task", "input"),
                run_options,
            );
            let _ = sender.send(result);
        });
        let process_group_id = wait_for_process_group(&registry, "successful-descendant");
        let descendant_process_id = wait_for_process_id(&descendant_path);
        assert_eq!(
            get_process_group_id(descendant_process_id),
            Some(process_group_id)
        );
        let started_at = Instant::now();
        fs::write(&release_path, "release").expect("release successful wrapper");

        let result = match receiver.recv_timeout(TEST_WAIT_TIMEOUT) {
            Ok(result) => result,
            Err(error) => {
                signal_process_group(process_group_id, libc::SIGKILL);
                let _ = worker.join();
                panic!("successful wrapper cleanup did not return: {error}");
            }
        };
        worker.join().expect("worker does not panic");
        let text = result.expect("successful wrapper output is accepted");

        assert_eq!(text, "accepted output");
        assert!(started_at.elapsed() < TEST_WAIT_TIMEOUT);
        assert_process_is_gone(descendant_process_id);
        assert!(!process_group_exists(process_group_id));
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn wrapper_exit_before_deadline_stays_successful_after_slow_group_cleanup() {
        let directory = TestDirectory::new();
        let descendant_ready_path = directory.path().join("slow-descendant-ready");
        let script = write_script(
            directory.path(),
            "codex",
            &format!(
                r#"
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
sh -c 'trap "" INT; printf ready > "{}"; while :; do sleep 1; done' &
while [ ! -s "{}" ]; do sleep 0.01; done
printf 'completed before deadline' > "$output"
"#,
                descendant_ready_path.display(),
                descendant_ready_path.display()
            ),
        );
        let mut run_options = options(script, directory.path());
        run_options.limits.deadline = Duration::from_secs(5);
        run_options.limits.signal_grace = Duration::from_millis(5_200);
        let started_at = Instant::now();

        let text = run_refine(
            &CodexRegistry::default(),
            request("completed-before-deadline", "task", "input"),
            run_options,
        )
        .expect("completed wrapper is not relabelled as timed out");

        assert_eq!(text, "completed before deadline");
        assert!(started_at.elapsed() >= Duration::from_secs(5));
        assert!(started_at.elapsed() < TEST_WAIT_TIMEOUT);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn errors_are_classified_without_exposing_diagnostics() {
        let directory = TestDirectory::new();
        let cases = [
            (
                "auth",
                "please run codex login",
                CodexSparkErrorCode::AuthRequired,
            ),
            (
                "model",
                "model entitlement unavailable",
                CodexSparkErrorCode::ModelUnavailable,
            ),
            (
                "flags",
                "unexpected argument --ignore-rules",
                CodexSparkErrorCode::CliIncompatible,
            ),
            (
                "generic",
                "secret raw failure",
                CodexSparkErrorCode::ExecutionFailed,
            ),
        ];
        for (name, diagnostic, expected_code) in cases {
            let script = write_script(
                directory.path(),
                name,
                &format!("printf '%s' '{diagnostic}' >&2\nexit 2"),
            );
            let error = run_direct(
                &CodexRegistry::default(),
                script,
                directory.path(),
                request(name, "task", "input"),
            )
            .expect_err("non-zero exit is rejected");
            assert_eq!(error.code, expected_code);
            assert!(!error.message.contains(diagnostic));
            let serialized = serde_json::to_value(&error).expect("serialize IPC error");
            assert_eq!(serialized["code"], expected_code_as_str(expected_code));
            assert_eq!(serialized.as_object().map(serde_json::Map::len), Some(2));
        }

        let flooded_stdout_script = write_script(
            directory.path(),
            "stdout-flood-auth",
            r#"
i=0
while [ "$i" -lt 3000 ]; do
  printf 'stdout pressure line %s xxxxxxxxxxxxxxxxxxxxxxxx\n' "$i"
  i=$((i + 1))
done
printf 'please run codex login' >&2
exit 2
"#,
        );
        let error = run_direct(
            &CodexRegistry::default(),
            flooded_stdout_script,
            directory.path(),
            request("stdout-flood-auth", "task", "input"),
        )
        .expect_err("stderr auth marker survives stdout pressure");
        assert_eq!(error.code, CodexSparkErrorCode::AuthRequired);

        let stderr_first = classify_diagnostics(&ProcessDiagnostics {
            stdout: b"please run codex login".to_vec(),
            stderr: b"unexpected argument --ignore-rules".to_vec(),
        });
        assert_eq!(stderr_first.code, CodexSparkErrorCode::CliIncompatible);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn request_and_output_limits_accept_the_boundary_and_reject_the_next_byte() {
        let directory = TestDirectory::new();
        let boundary_script = write_script(
            directory.path(),
            "boundary",
            r#"
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
cat >/dev/null
printf 'four' > "$output"
"#,
        );
        let mut run_options = options(boundary_script, directory.path());
        run_options.limits.max_developer_instructions_bytes = 4;
        run_options.limits.max_input_bytes = 4;
        run_options.limits.max_output_bytes = 4;
        assert_eq!(
            run_refine(
                &CodexRegistry::default(),
                request("boundary", "four", "four"),
                run_options.clone(),
            ),
            Ok("four".to_owned())
        );

        let task_error = run_refine(
            &CodexRegistry::default(),
            request("large-task", "12345", "four"),
            run_options.clone(),
        )
        .expect_err("task over limit is rejected");
        assert_eq!(task_error.code, CodexSparkErrorCode::TaskPromptTooLarge);
        let input_error = run_refine(
            &CodexRegistry::default(),
            request("large-input", "four", "12345"),
            run_options.clone(),
        )
        .expect_err("input over limit is rejected");
        assert_eq!(input_error.code, CodexSparkErrorCode::InputTooLarge);

        let oversized_script = write_script(
            directory.path(),
            "oversized",
            r#"
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then shift; output="$1"; fi
  shift
done
cat >/dev/null
printf '12345' > "$output"
"#,
        );
        run_options.executable = options(oversized_script, directory.path()).executable;
        let output_error = run_refine(
            &CodexRegistry::default(),
            request("large-output", "four", "four"),
            run_options,
        )
        .expect_err("output over limit is rejected");
        assert_eq!(output_error.code, CodexSparkErrorCode::OutputTooLarge);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn missing_empty_and_unreadable_outputs_have_distinct_errors() {
        let directory = TestDirectory::new();
        let cases = [
            ("missing", "cat >/dev/null", CodexSparkErrorCode::OutputUnreadable),
            (
                "empty",
                "output=''\nwhile [ \"$#\" -gt 0 ]; do if [ \"$1\" = \"--output-last-message\" ]; then shift; output=\"$1\"; fi; shift; done\ncat >/dev/null\nprintf '  ' > \"$output\"",
                CodexSparkErrorCode::OutputEmpty,
            ),
            (
                "unreadable",
                "output=''\nwhile [ \"$#\" -gt 0 ]; do if [ \"$1\" = \"--output-last-message\" ]; then shift; output=\"$1\"; fi; shift; done\ncat >/dev/null\nmkdir \"$output\"",
                CodexSparkErrorCode::OutputUnreadable,
            ),
        ];
        for (name, body, expected_code) in cases {
            let script = write_script(directory.path(), name, body);
            let error = run_direct(
                &CodexRegistry::default(),
                script,
                directory.path(),
                request(name, "task", "input"),
            )
            .expect_err("invalid output is rejected");
            assert_eq!(error.code, expected_code);
        }
        let error = run_direct(
            &CodexRegistry::default(),
            directory.path().join("absent-codex"),
            directory.path(),
            request("missing-cli", "task", "input"),
        )
        .expect_err("missing executable is rejected");
        assert_eq!(error.code, CodexSparkErrorCode::CliNotFound);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn final_output_rejects_symlinks_and_fifos_without_blocking() {
        if let Some(fifo_path) = env::var_os(FIFO_CHILD_PATH_ENV) {
            let success_path = env::var_os(FIFO_CHILD_SUCCESS_PATH_ENV)
                .expect("FIFO child success path is configured");
            assert_eq!(
                read_final_output(Path::new(&fifo_path), 1024)
                    .expect_err("FIFO output is rejected")
                    .code,
                CodexSparkErrorCode::OutputUnreadable
            );
            fs::write(success_path, "output-unreadable").expect("record FIFO child success");
            return;
        }

        let directory = TestDirectory::new();
        let target_path = directory.path().join("target");
        let symlink_path = directory.path().join("symlink-output");
        fs::write(&target_path, "target text").expect("write symlink target");
        symlink(&target_path, &symlink_path).expect("create output symlink");
        assert_eq!(
            read_final_output(&symlink_path, 1024)
                .expect_err("symlink output is rejected")
                .code,
            CodexSparkErrorCode::OutputUnreadable
        );

        let fifo_path = directory.path().join("fifo-output");
        let child_success_path = directory.path().join("fifo-child-success");
        let fifo_path_c = CString::new(fifo_path.as_os_str().as_bytes()).expect("valid FIFO path");
        assert_eq!(unsafe { libc::mkfifo(fifo_path_c.as_ptr(), 0o600) }, 0);
        let mut child = Command::new(env::current_exe().expect("resolve current test executable"))
            .args(["--exact", FIFO_TEST_NAME, "--nocapture"])
            .env(FIFO_CHILD_PATH_ENV, &fifo_path)
            .env(FIFO_CHILD_SUCCESS_PATH_ENV, &child_success_path)
            .spawn()
            .expect("spawn FIFO output test child");
        let started_at = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if started_at.elapsed() < TEST_WAIT_TIMEOUT => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    let kill_result = child.kill();
                    let reap_result = child.wait();
                    panic!(
                        "FIFO output child timed out; kill: {kill_result:?}; reap: {reap_result:?}"
                    );
                }
                Err(error) => {
                    let kill_result = child.kill();
                    let reap_result = child.wait();
                    panic!(
                        "Could not inspect FIFO output child: {error}; kill: {kill_result:?}; reap: {reap_result:?}"
                    );
                }
            }
        };
        assert!(status.success(), "FIFO output child failed: {status}");
        assert_eq!(
            fs::read_to_string(child_success_path).expect("FIFO child recorded success"),
            "output-unreadable"
        );
    }

    #[test]
    fn deadline_force_kills_stubborn_process_and_cleans_up() {
        let directory = TestDirectory::new();
        let script = write_script(
            directory.path(),
            "codex",
            "trap '' INT\nwhile :; do sleep 1; done",
        );
        let mut run_options = options(script, directory.path());
        run_options.limits.deadline = Duration::from_secs(1);
        run_options.limits.signal_grace = Duration::from_millis(20);

        let registry = CodexRegistry::default();
        let worker_registry = registry.clone();
        let (sender, receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            let result = run_refine(
                &worker_registry,
                request("timeout", "task", &"x".repeat(256 * 1024)),
                run_options,
            );
            let _ = sender.send(result);
        });
        let process_id = wait_for_process_group(&registry, "timeout");
        let result = match receiver.recv_timeout(TEST_WAIT_TIMEOUT) {
            Ok(result) => result,
            Err(timeout_error) => {
                let did_signal_owned_group = {
                    let state = lock_unpoisoned(&registry.state);
                    state.active.get("timeout").is_some_and(|run| {
                        let process_group_id = lock_unpoisoned(&run.process_group_id);
                        if *process_group_id == Some(process_id) {
                            signal_process_group(process_id, libc::SIGKILL);
                            true
                        } else {
                            false
                        }
                    })
                };
                let cleanup_result = receiver.recv_timeout(TEST_WAIT_TIMEOUT);
                if cleanup_result.is_ok() {
                    worker.join().expect("supervised worker does not panic");
                }
                panic!(
                    "deadline worker did not return: {timeout_error}; signalled owned group: {did_signal_owned_group}; cleanup: {cleanup_result:?}"
                );
            }
        };
        worker.join().expect("worker does not panic");
        let error = result.expect_err("stubborn process times out");

        assert_eq!(error.code, CodexSparkErrorCode::TimedOut);
        assert_process_is_gone(process_id);
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn cancellation_kills_stubborn_descendant_after_wrapper_exits() {
        let directory = TestDirectory::new();
        let descendant_path = directory.path().join("descendant-pid");
        let script = write_script(
            directory.path(),
            "codex",
            &format!(
                "sh -c 'trap \"\" INT; while :; do sleep 1; done' &\nprintf '%s' \"$!\" > '{}'\ntrap 'exit 0' INT\nwait",
                descendant_path.display()
            ),
        );
        let registry = CodexRegistry::default();
        let worker_registry = registry.clone();
        let run_options = options(script, directory.path());
        let worker = thread::spawn(move || {
            run_refine(
                &worker_registry,
                request("cancel-active", "task", &"x".repeat(256 * 1024)),
                run_options,
            )
        });
        let process_group_id = wait_for_process_group(&registry, "cancel-active");
        let descendant_process_id = wait_for_process_id(&descendant_path);
        assert_eq!(
            get_process_group_id(descendant_process_id),
            Some(process_group_id)
        );

        registry.cancel("cancel-active", Instant::now());
        let error = worker
            .join()
            .expect("worker does not panic")
            .expect_err("cancelled run fails");

        assert_eq!(error.code, CodexSparkErrorCode::Cancelled);
        assert_process_is_gone(process_group_id);
        assert_process_is_gone(descendant_process_id);
        assert!(!process_group_exists(process_group_id));
        assert!(lock_unpoisoned(&registry.state).active.is_empty());
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn cancellation_tombstones_are_idempotent_bounded_and_expiring() {
        let directory = TestDirectory::new();
        let marker = directory.path().join("started");
        let script = write_script(
            directory.path(),
            "codex",
            "touch \"$(dirname \"$0\")/started\"",
        );
        let registry = CodexRegistry::default();
        let now = Instant::now();
        registry.cancel("before-register", now);
        registry.cancel("before-register", now + Duration::from_secs(1));
        assert_eq!(lock_unpoisoned(&registry.state).tombstones.len(), 1);
        assert_eq!(
            run_direct(
                &registry,
                script,
                directory.path(),
                request("before-register", "task", "input"),
            )
            .expect_err("tombstone cancels before process spawn")
            .code,
            CodexSparkErrorCode::Cancelled
        );
        assert!(!marker.exists());
        for index in 0..=MAX_TOMBSTONES {
            registry.cancel(&format!("request-{index}"), now + Duration::from_secs(3));
        }
        let state = lock_unpoisoned(&registry.state);
        assert_eq!(state.tombstones.len(), MAX_TOMBSTONES);
        assert_eq!(
            state
                .tombstones
                .front()
                .map(|item| item.request_id.as_str()),
            Some("request-1")
        );
        drop(state);
        assert!(registry
            .register("request-1", now + TOMBSTONE_TTL + Duration::from_secs(4))
            .is_ok());
        registry.finish("request-1");
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn active_run_limit_rejects_before_process_spawn() {
        let directory = TestDirectory::new();
        let marker = directory.path().join("started");
        let script = write_script(
            directory.path(),
            "codex",
            "touch \"$(dirname \"$0\")/started\"",
        );
        let registry = CodexRegistry::default();
        let now = Instant::now();
        let active_request_ids = (0..MAX_ACTIVE_RUNS)
            .map(|index| format!("active-{index}"))
            .collect::<Vec<_>>();
        for request_id in &active_request_ids {
            registry
                .register(request_id, now)
                .expect("register active run");
        }

        let error = run_direct(
            &registry,
            script,
            directory.path(),
            request("over-limit", "task", "input"),
        )
        .expect_err("run over the active limit is rejected");

        assert_eq!(error.code, CodexSparkErrorCode::ExecutionFailed);
        assert!(!marker.exists());
        registry.finish(&active_request_ids[0]);
        registry
            .register("after-finish", now)
            .expect("released slot accepts new work");
        registry.finish("after-finish");
        for request_id in active_request_ids.iter().skip(1) {
            registry.finish(request_id);
        }
        assert_no_run_directories(directory.path());
    }

    #[test]
    fn duplicate_and_invalid_request_ids_are_rejected() {
        let registry = CodexRegistry::default();
        let now = Instant::now();
        assert_eq!(
            registry
                .register("", now)
                .expect_err("empty id rejected")
                .code,
            CodexSparkErrorCode::InvalidRequest
        );
        assert_eq!(
            registry
                .register(&"x".repeat(MAX_REQUEST_ID_BYTES + 1), now)
                .expect_err("long id rejected")
                .code,
            CodexSparkErrorCode::InvalidRequest
        );
        registry
            .register("duplicate", now)
            .expect("first registration");
        assert_eq!(
            registry
                .register("duplicate", now)
                .expect_err("duplicate rejected")
                .code,
            CodexSparkErrorCode::InvalidRequest
        );
        registry.finish("duplicate");
    }

    #[test]
    fn shutdown_waits_for_reaping_cleanup_and_registry_removal() {
        let directory = TestDirectory::new();
        let script = write_script(
            directory.path(),
            "codex",
            "trap '' INT\nwhile :; do sleep 1; done",
        );
        let registry = CodexRegistry::default();
        let worker_registry = registry.clone();
        let run_options = options(script, directory.path());
        let worker = thread::spawn(move || {
            run_refine(
                &worker_registry,
                request("shutdown", "task", &"x".repeat(256 * 1024)),
                run_options,
            )
        });
        let process_id = wait_for_process_group(&registry, "shutdown");

        registry.shutdown(Duration::from_millis(20));
        let error = worker
            .join()
            .expect("worker does not panic")
            .expect_err("shutdown cancels run");

        assert_eq!(error.code, CodexSparkErrorCode::Cancelled);
        assert_process_is_gone(process_id);
        let state = lock_unpoisoned(&registry.state);
        assert!(state.is_closed);
        assert!(state.active.is_empty());
        assert!(state.tombstones.is_empty());
        drop(state);
        assert_eq!(
            registry
                .register("after-shutdown", Instant::now())
                .expect_err("closed registry rejects new work")
                .code,
            CodexSparkErrorCode::InvalidRequest
        );
        assert_no_run_directories(directory.path());
    }

    fn expected_code_as_str(code: CodexSparkErrorCode) -> &'static str {
        match code {
            CodexSparkErrorCode::InvalidRequest => "invalid-request",
            CodexSparkErrorCode::TaskPromptTooLarge => "task-prompt-too-large",
            CodexSparkErrorCode::InputTooLarge => "input-too-large",
            CodexSparkErrorCode::CliNotFound => "cli-not-found",
            CodexSparkErrorCode::CliIncompatible => "cli-incompatible",
            CodexSparkErrorCode::AuthRequired => "auth-required",
            CodexSparkErrorCode::ModelUnavailable => "model-unavailable",
            CodexSparkErrorCode::ExecutionFailed => "execution-failed",
            CodexSparkErrorCode::TimedOut => "timed-out",
            CodexSparkErrorCode::Cancelled => "cancelled",
            CodexSparkErrorCode::OutputUnreadable => "output-unreadable",
            CodexSparkErrorCode::OutputEmpty => "output-empty",
            CodexSparkErrorCode::OutputTooLarge => "output-too-large",
        }
    }
}
