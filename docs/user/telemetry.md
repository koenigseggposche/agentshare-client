# Diagnostics and product usage data

AgentShare Client keeps diagnostics on the execution host by default. Product analytics
has no default receiver or key. An operator can enable a PostHog-compatible receiver by
setting all three server variables: `T3CODE_TELEMETRY_ENABLED=true`, `T3CODE_POSTHOG_HOST`,
and `T3CODE_POSTHOG_KEY`. The chosen receiver receives product metadata, hashed account
and installation identifiers, model usage counts and request outcomes. It does not
receive prompts, responses, file contents or authentication credentials.

Relay tracing requires an explicitly configured endpoint, dataset and token.
`T3CODE_TELEMETRY_ENABLED=false` disables product analytics and server relay tracing.
An administrator can also turn both off with a [managed policy](./managed-policy.md#other-capabilities).
Browser and mobile relay exports use their build configuration.

## Mobile diagnostics

Use **Settings > About > Diagnostics** to inspect and copy local startup diagnostics. Reports are
copied only when you choose to share them in an issue.

## Export diagnostics to your own receiver

To send traces, metrics, or logs to an OpenTelemetry receiver, open
**Settings > Maintenance > Diagnostics**, select an environment, and enter each signal's OTLP HTTP
endpoint under **OpenTelemetry export** (for example `http://localhost:4318/v1/traces`). Save, then
restart that environment's server. The receiver must be reachable from the server's machine.
**Test** sends an empty export from the server to check an endpoint before or after you save it;
saved endpoints are checked when the section opens. Checks send authentication headers only to
the signal's currently running endpoint and do not follow redirects. To check a new endpoint
that requires authentication, save it and restart the server first.

`T3CODE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` environment variables override the saved
settings. An overridden signal shows **Set by environment** and names the variable that set it, and its
**Test** checks the running endpoint instead of the field. For endpoints saved here or set with `T3CODE_OTLP_*_URL`, set `T3CODE_OTLP_HEADERS` for
receivers that need authentication and `T3CODE_OTLP_PROTOCOL=http/protobuf` for receivers that do
not accept JSON. An endpoint set with `OTEL_EXPORTER_OTLP_*` takes its headers and protocol from
`OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_PROTOCOL` instead.
