use std::collections::{HashMap, VecDeque};
use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
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
const TOMBSTONE_TTL: Duration = Duration::from_secs(60);
const MAX_TOMBSTONES: usize = 256;
const MAX_REQUEST_ID_BYTES: usize = 128;
static RUN_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy)]
struct RunLimits {
    deadline: Duration,
    signal_grace: Duration,
    poll_interval: Duration,
    max_task_prompt_bytes: usize,
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
            max_task_prompt_bytes: 64 * 1024,
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
    task_prompt: String,
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
    .unwrap_or_else(|_| {
        Err(CodexSparkError::new(
            CodexSparkErrorCode::ExecutionFailed,
            "Refine failed.",
        ))
    })
}

#[tauri::command]
pub fn cancel_codex_spark(request: CancelRequest, registry: State<'_, CodexRegistry>) {
    registry.cancel(&request.request_id, Instant::now());
}

#[derive(Clone)]
struct RunOptions {
    executable: Option<PathBuf>,
    temp_root: PathBuf,
    limits: RunLimits,
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
        Some(path) if is_executable_file(&path) => path,
        Some(_) => return Err(cli_not_found()),
        None => find_codex_executable().ok_or_else(cli_not_found)?,
    };
    let run_directory = create_run_directory(&options.temp_root).map_err(|_| {
        CodexSparkError::new(CodexSparkErrorCode::ExecutionFailed, "Refine failed.")
    })?;
    let output_path = run_directory.0.join("final-message.md");
    let outcome = execute_process(
        &executable,
        &request.task_prompt,
        request.input.into_bytes(),
        &output_path,
        Arc::clone(&active_run),
        options.limits,
    );
    let result = match outcome? {
        ProcessOutcome::Exited(status, _) if status.success() => {
            read_final_output(&output_path, options.limits.max_output_bytes)
        }
        ProcessOutcome::Exited(_, diagnostics) => Err(classify_diagnostics(&diagnostics)),
        ProcessOutcome::Cancelled => Err(CodexSparkError::cancelled()),
        ProcessOutcome::TimedOut => Err(CodexSparkError::timed_out()),
    };
    drop(run_directory);
    result
}

fn validate_request(request: &RefineRequest, limits: RunLimits) -> Result<(), CodexSparkError> {
    validate_request_id(&request.request_id)?;
    if request.task_prompt.len() > limits.max_task_prompt_bytes {
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

fn find_codex_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("PATH") {
        candidates.extend(env::split_paths(&path).map(|directory| directory.join("codex")));
    }
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.extend([
            home.join(".bun/bin/codex"),
            home.join(".local/bin/codex"),
            home.join(".npm-global/bin/codex"),
        ]);
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ]);
    candidates.into_iter().find(|path| is_executable_file(path))
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
    executable: &Path,
    task_prompt: &str,
    input: Vec<u8>,
    output_path: &Path,
    active_run: Arc<ActiveRun>,
    limits: RunLimits,
) -> Result<ProcessOutcome, CodexSparkError> {
    let mut command = Command::new(executable);
    command
        .args(build_arguments(output_path, task_prompt))
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
        child.stdout.take().ok_or_else(execution_failed)?,
        Arc::clone(&stdout),
        limits.max_diagnostic_bytes,
    );
    let stderr_thread = spawn_drain(
        child.stderr.take().ok_or_else(execution_failed)?,
        Arc::clone(&stderr),
        limits.max_diagnostic_bytes,
    );
    let stdin_thread = child.stdin.take().map(|mut stdin| {
        thread::spawn(move || {
            let _ = stdin.write_all(&input);
        })
    });

    let started_at = Instant::now();
    let outcome = loop {
        if active_run.cancelled.load(Ordering::Acquire) {
            stop_process(&mut child, process_group_id, limits);
            break ProcessOutcome::Cancelled;
        }
        if started_at.elapsed() >= limits.deadline {
            stop_process(&mut child, process_group_id, limits);
            break ProcessOutcome::TimedOut;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                break ProcessOutcome::Exited(status, ProcessDiagnostics::default());
            }
            Ok(None) => thread::sleep(limits.poll_interval),
            Err(_) => {
                stop_process(&mut child, process_group_id, limits);
                join_io_threads(stdin_thread, stdout_thread, stderr_thread);
                return Err(execution_failed());
            }
        }
    };
    join_io_threads(stdin_thread, stdout_thread, stderr_thread);
    *lock_unpoisoned(&active_run.process_group_id) = None;
    let diagnostics = ProcessDiagnostics {
        stdout: lock_unpoisoned(&stdout).clone(),
        stderr: lock_unpoisoned(&stderr).clone(),
    };
    Ok(match outcome {
        ProcessOutcome::Exited(status, _) => ProcessOutcome::Exited(status, diagnostics),
        other => other,
    })
}

fn build_arguments(output_path: &Path, task_prompt: &str) -> Vec<OsString> {
    [
        OsString::from("exec"),
        OsString::from("--ephemeral"),
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
        OsString::from("approval_policy=\"never\""),
        OsString::from("--color"),
        OsString::from("never"),
        OsString::from("--output-last-message"),
        output_path.as_os_str().to_owned(),
        OsString::from(task_prompt),
    ]
    .into_iter()
    .collect()
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
    stdin_thread: Option<thread::JoinHandle<()>>,
    stdout_thread: thread::JoinHandle<()>,
    stderr_thread: thread::JoinHandle<()>,
) {
    if let Some(stdin_thread) = stdin_thread {
        let _ = stdin_thread.join();
    }
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();
}

fn stop_process(child: &mut Child, process_group_id: i32, limits: RunLimits) {
    signal_process_group(process_group_id, libc::SIGINT);
    let grace_started_at = Instant::now();
    let mut is_wrapper_reaped = false;
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
    let file = File::open(path).map_err(|_| {
        CodexSparkError::new(
            CodexSparkErrorCode::OutputUnreadable,
            "Could not read the refined output.",
        )
    })?;
    if file
        .metadata()
        .map(|metadata| metadata.len())
        .unwrap_or(u64::MAX)
        > max_bytes as u64
    {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::OutputTooLarge,
            "Codex response is too large.",
        ));
    }
    let mut bytes = Vec::new();
    file.take((max_bytes + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            CodexSparkError::new(
                CodexSparkErrorCode::OutputUnreadable,
                "Could not read the refined output.",
            )
        })?;
    if bytes.len() > max_bytes {
        return Err(CodexSparkError::new(
            CodexSparkErrorCode::OutputTooLarge,
            "Codex response is too large.",
        ));
    }
    let text = String::from_utf8(bytes).map_err(|_| {
        CodexSparkError::new(
            CodexSparkErrorCode::OutputUnreadable,
            "Could not read the refined output.",
        )
    })?;
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

fn prune_tombstones(tombstones: &mut VecDeque<Tombstone>, now: Instant) {
    tombstones.retain(|tombstone| now.duration_since(tombstone.created_at) < TOMBSTONE_TTL);
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);

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

    fn request(request_id: &str, task_prompt: &str, input: &str) -> RefineRequest {
        RefineRequest {
            request_id: request_id.to_owned(),
            task_prompt: task_prompt.to_owned(),
            input: input.to_owned(),
        }
    }

    fn options(executable: PathBuf, temp_root: &Path) -> RunOptions {
        RunOptions {
            executable: Some(executable),
            temp_root: temp_root.to_owned(),
            limits: RunLimits {
                deadline: Duration::from_secs(10),
                signal_grace: Duration::from_millis(40),
                poll_interval: Duration::from_millis(5),
                max_task_prompt_bytes: 1024,
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
            assert!(started_at.elapsed() < Duration::from_secs(2));
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
            assert!(started_at.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn wait_for_process_id(path: &Path) -> i32 {
        let started_at = Instant::now();
        loop {
            if let Ok(process_id) = fs::read_to_string(path) {
                return process_id.parse().expect("parse process id");
            }
            assert!(started_at.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn command_keeps_the_prompt_in_argv_and_the_draft_on_stdin() {
        let directory = TestDirectory::new();
        let script = write_script(
            directory.path(),
            "codex",
            r#"
args_file="$(dirname "$0")/args"
stdin_file="$(dirname "$0")/stdin"
pgid_file="$(dirname "$0")/pgid"
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
            request("request-1", "TASK PROMPT", hostile_input),
        )
        .expect("fake Codex run succeeds");

        assert_eq!(text, "final **text**");
        let arguments = fs::read_to_string(directory.path().join("args")).expect("read args");
        assert!(arguments.contains("exec\n--ephemeral\n--ignore-user-config\n--ignore-rules"));
        assert!(arguments.contains("--sandbox\nread-only"));
        assert!(arguments.contains("--model\ngpt-5.3-codex-spark"));
        assert!(arguments.contains("-c\nmodel_reasoning_effort=\"low\""));
        assert!(arguments.contains("-c\napproval_policy=\"never\""));
        assert!(arguments.contains("--color\nnever"));
        assert!(arguments.contains("--output-last-message\n"));
        assert!(arguments.ends_with("TASK PROMPT\n"));
        assert!(!arguments.contains(hostile_input));
        assert!(!arguments.contains("--json"));
        assert_eq!(
            fs::read_to_string(directory.path().join("stdin")).expect("read stdin"),
            hostile_input
        );
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
        run_options.limits.max_task_prompt_bytes = 4;
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
        run_options.executable = Some(oversized_script);
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
        let worker = thread::spawn(move || {
            run_refine(
                &worker_registry,
                request("timeout", "task", &"x".repeat(256 * 1024)),
                run_options,
            )
        });
        let process_id = wait_for_process_group(&registry, "timeout");
        let error = worker
            .join()
            .expect("worker does not panic")
            .expect_err("stubborn process times out");

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
