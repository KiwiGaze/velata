<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/velata-mark-dark.svg" />
    <img src="design/logo/velata-mark.svg" width="56" alt="Velata mark" />
  </picture>
</p>

# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, use GitHub's private vulnerability reporting: go to the repository's **Security** tab and click **Report a vulnerability**. You will get a response within a few days.

Please include reproduction steps, the affected version, and your macOS version.

## Supported versions

Only the latest release receives security fixes.

## Security model

Understanding what Velata does and does not do helps scope reports:

- **Bring your own key.** Refine requests go directly from the app to the OpenAI-compatible endpoint you configure. There is no Velata server in between.
- **The API key is stored only in the macOS Keychain** (service `com.velata.app`). It is never written to `settings.json`, logs, or disk.
- **Clipboard only.** Velata writes refined text to the clipboard and hides its window. It never simulates keystrokes and never injects text into other applications.
- **The refine prompt treats input as text to clean, never as instructions to execute.**
- **No telemetry.** The app makes no network requests other than the refine and connection-test calls to the endpoint you configured.

Reports about weakening any of the above (key leakage, prompt-guard bypass that causes input execution, unexpected network calls) are especially welcome.
