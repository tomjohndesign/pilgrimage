# In-game bug reports

Open **World settings → Report a bug**. The form captures a fixed diagnostic
snapshot, accepts a message, lets the player review the snapshot, and creates
an issue in `tomjohndesign/pilgrimage`. It retains the draft if delivery fails
or the dialog is closed. Successful submissions show the issue link.

## Server configuration

Set `BUG_REPORT_GITHUB_TOKEN` in the deployment's server environment (or
`.env.local` for local development) and restart/redeploy. Use a dedicated
reporting account's fine-grained GitHub token restricted to this repository,
with **Issues: read and write**. Enable issues on the repository. Never use a
`NEXT_PUBLIC_` variable for the credential. The player does not log in to GitHub;
the credential's owner appears as the issue author.

The integration uses GitHub's [Create an issue REST endpoint](https://docs.github.com/en/rest/issues/issues#create-an-issue).
No labels, assignees or other repository writes are needed. A missing credential
returns an explicit unavailable message; no fallback asks the player to post
under their own GitHub identity. Tests mock GitHub and do not create real issues.

Before enabling the public endpoint, configure a shared rate limit at the
hosting edge/WAF for `POST /api/bug-report` (for example, 10 requests per hour
per source and a repository-wide hourly cap). The route also caps attempts to
10 per hour per server instance, bounds actual request bytes to 48 KB, checks
same-origin JSON submissions, and times out GitHub calls. Its in-memory cap
resets on restart and is **not shared across serverless instances**. Origin
checks prevent cross-site browser submissions, but are not bot authentication.
The application stores no IP addresses or stable player identifiers.

## Diagnostic privacy and scope

`lib/bug-report.ts` is the allowlist shared by the browser preview and server.
Unknown keys are stripped recursively before anything is forwarded to GitHub.
Automated diagnostic fields are bounded numbers, booleans, or fixed enums,
except for the validated release version. They include:

- Release, development/production mode, approximate session minutes, browser
  family/major version, broad operating system, and viewport size category.
- Map seed, generation/movement settings, elevation and pixelation settings.
- Camera position/zoom/rotation, simulation clock/speed/pause state, cheat flags,
  population counts, treasury, admissions, and resource counts.
- Up to 100 building footprints, types, rotations and construction progress;
  the number omitted is explicit. Building labels and identifiers are excluded.
- Counts of browser errors, unhandled rejections and WebGL context losses since
  the game HUD mounted. Error text, stack traces and failed resource URLs are
  never recorded by this feature.

This is a diagnostic snapshot, not a full save or replay. It excludes player
names, account details, cookies, local storage, page URLs, query strings,
referrers, raw user-agent strings, device/GPU identifiers, and screenshots.
The request to GitHub contains only the generated title and report body; client
headers are not forwarded. Reporting does not add analytics or persistent IDs.
Normal hosting/network logs are controlled by the hosting provider separately.

The message is intentional free text. The form explains that reports may be
public and asks players to omit personal information. Arbitrary prose cannot
be guaranteed anonymous; review the message before submitting. GitHub mentions
are defanged and the message is fenced as plain text.

A delivery timeout can occur after GitHub creates an issue. The form therefore
asks the player to check existing reports before retrying rather than retrying
automatically. No live issues are created during automated validation.
