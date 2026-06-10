<div align="center">
  <h1>Mocknroll CLI</h1>
</div>

Mocknroll CLI is a lightweight and fast command-line tool to deploy your mock APIs anywhere. Feed it an environment data file (JSON) or an OpenAPI specification file (JSON or YAML), and you are good to go.

> **Mocknroll CLI is a fork of [Mockoon CLI](https://github.com/mockoon/mockoon).** It reuses Mockoon's mock-server engine and data-file format, so the upstream [Mockoon documentation](https://mockoon.com/docs/latest/about/) applies to the mocking features (templating system, proxy mode, route response rules, etc.). The few `MOCKOON_*` identifiers and the Mockoon Cloud integration mentioned below are kept on purpose because they reflect the underlying engine and the external Mockoon Cloud service.

- [Installation](#installation)
- [Run a mock API](#run-a-mock-api)
  - [From a local environment file](#from-a-local-environment-file)
  - [From a cloud-hosted environment](#from-a-cloud-hosted-environment)
  - [From an OpenAPI specification file](#from-an-openapi-specification-file)
- [Compatibility](#compatibility)
- [Commands](#commands)
  - [`start` command](#start-command)
  - [`stop` command](#stop-command)
  - [`status` command](#status-command)
  - [`dockerize` command](#dockerize-command)
  - [`import` command](#import-command)
  - [`export` command](#export-command)
  - [`validate` command](#validate-command)
  - [`help` command](#help-command)
- [Logs](#logs)

## Installation

This fork is distributed from source (it is not published to a package registry). From the repository root:

```sh
cd packages/cli
npm run build
npm link --no-workspaces
```

This installs a global `mocknroll` command on your machine. After editing the source, run `npm run build` again — the linked command picks the new build up automatically (no need to re-link). To remove the global command later: `npm rm -g mocknroll`.

Usage:

```sh
$ mocknroll COMMAND
```

## Run a mock API

### From a local environment file

You can run your mock in a single step with the [`start` command](#start-command), replacing `~/path/to/your-environment-file.json` with the actual location of your environment file:

```sh
$ mocknroll start --data ~/path/to/your-environment-file.json
```

You can also load an environment file directly from a URL by passing it as the `--data` parameter:

```sh
$ mocknroll start --data https://domain.com/your-environment-file.json
```

The CLI can import and migrate data from older versions of the file format. It does not alter the file you provide; it only migrates a copy.

### From a cloud-hosted environment

You can run a cloud-hosted environment from [Mockoon Cloud](https://mockoon.com/cloud/) by providing the cloud URL as the `--data` parameter:

```sh
$ mocknroll start --data cloud://{UUID} --token {TOKEN}
```

Where `{UUID}` is your environment's UUID and `{TOKEN}` is your Mockoon Cloud [access token](https://mockoon.com/cloud/docs/access-tokens/).

### From an OpenAPI specification file

You can also pass an OpenAPI specification file as the `--data` parameter. Both JSON and YAML formats are supported in versions 2.0.0 and 3.0.0, as a local path or a URL:

```sh
$ mocknroll start --data ~/path/to/your-openapi-file.yaml
$ mocknroll start --data https://domain.com/your-openapi-file.yaml
```

> ⚠️ Not all OpenAPI features map to the mock engine ([compatibility notes](https://mockoon.com/docs/latest/openapi/openapi-specification-compatibility/)). For full fidelity (templating, rules, etc.), use environment data files ([see above](#from-a-local-environment-file)).

## Compatibility

Mocknroll CLI has been tested on Node.js versions 18, 20, 22 and 24.

## Commands

- [`start`](#start-command)
- [`stop`](#stop-command)
- [`status`](#status-command)
- [`dockerize`](#dockerize-command)
- [`import`](#import-command)
- [`export`](#export-command)
- [`validate`](#validate-command)
- [`help`](#help-command)

### `start` command

Starts one (or more) mock API from environment file(s) as a foreground process.

The mocks will run by default on the ports and hostnames specified in the files. You can override these values by using the `--port` and `--hostname` flags.
`--data`, `--port`, `--hostname`, and `--public-base-url` flags support multiple entries to run multiple mock APIs at once (see examples below).

> 💡 To run the mock(s) in the background and free your terminal, use the `--detach` flag: `mocknroll start -d ./data-file.json --detach`. Manage the background process with the [`stop`](#stop-command) and [`status`](#status-command) commands. See [Background mode](#background-mode-detach) below.

**Usage**:
`$ mocknroll start`

**Options**:
|Flag|Description|
|-|-|
|-d, --data |[required] Path(s) or URL(s) to your environment file(s). Supports cloud URLs (e.g. `cloud://`, [see above](#from-a-cloud-hosted-environment)).|
|-p, --port |Override environment(s) port(s)|
|-l, --hostname |Override default listening hostname(s)|
|-c, --faker-locale | Faker locale (e.g. 'en', 'en_GB', etc. For supported locales, see below.)|
|-s, --faker-seed | Number for the Faker.js seed (e.g. 1234)|
|-t, --log-transaction | Log the full HTTP transaction (request and response)|
|-X, --disable-log-to-file | Disable logging to file|
|-e, --disable-routes | Disable route(s) by UUID or keyword present in the route's path (do not include a leading slash) or keyword present in a folder name. Use '\*' to disable all routes.|
|-r, --repair | If the data file seems too old, or an invalid environment file, migrate/repair without prompting|
|-x, --env-vars-prefix | Prefix for environment variables (default: 'MOCKOON\_')|
|-w, --watch | Watch local data file(s) for changes and restart the server when a change is detected (watch is using polling, see `--polling-interval` flag below)|
|--polling-interval | Local files watch polling interval in milliseconds (default: 2000)|
|-D, --detach | Start the mock(s) as a detached background process, freeing the terminal. Linux/macOS only. Incompatible with `--repair`. See [Background mode](#background-mode-detach) below.|
|--disable-admin-api | Disable the admin API, enabled by default (more info: https://mockoon.com/docs/latest/admin-api/overview/)|
|--disable-tls | Disable TLS for all environments. TLS configuration is part of the environment configuration (more info: https://mockoon.com/docs/latest/server-configuration/serving-over-tls/)|
|--max-transaction-logs | Maximum number of transaction logs to keep in memory for retrieval via the admin API (default: 100)|
|--enable-random-latency | Randomize global and responses latencies between 0 and the specified value (default: false)|
|--proxy | Override the environment's proxy settings (options: 'enabled' or 'disabled')|
|--public-base-url | Public base URL used to resolve [relative callback URLs](https://mockoon.com/docs/latest/callbacks/overview/#configure-a-callback) and for the [`baseUrl` templating helper](https://mockoon.com/docs/latest/templating/mockoon-request-helpers/#baseurl) (e.g. https://api.example.com or http://localhost:3000). Must include the protocol and port if non-standard.|
|-k, --token | Access token used to fetch cloud-hosted environments from Mockoon Cloud (see [access token documentation](https://mockoon.com/cloud/docs/access-tokens/))|
|-h, --help | Show CLI help|

**Examples**:

```bash
$ mocknroll start --data ~/data.json
$ mocknroll start --data ~/data.json --watch
$ mocknroll start --data ~/data1.json ~/data2.json --port 3000 3001 --hostname 127.0.0.1 192.168.1.1
$ mocknroll start --data https://file-server/data.json
$ mocknroll start --data ~/data.json --log-transaction
$ mocknroll start --data ~/data.json --disable-routes route1 route2 folder1
$ mocknroll start --data ~/data.json --disable-routes=*
$ mocknroll start --data ~/data.json --disable-routes "*"
$ mocknroll start --data ~/data.json --public-base-url https://api.example.com
$ mocknroll start --data cloud://def01727-aeb7-4cf1-9172-e0c38f22b224 --token mkn_sk_1234567890abcdef
```

#### Admin API

Each running mock API has an admin API enabled by default and available at `/mockoon-admin/`. This API allows you to interact with the running mock API, retrieve logs, and more. You can disable the admin API with the `--disable-admin-api` flag.

> 💡 To learn more about the admin API, check the [documentation](https://mockoon.com/docs/latest/admin-api/overview/).

#### Faker.js options

- **Locale**: You can set up Faker.js locale with the `--faker-locale` flag. If not provided, Faker.js will use the default locale: `en`. You can check the [Faker.js locales list](https://fakerjs.dev/guide/localization.html#available-locales) for more information (⚠️ Some locales may not yet be implemented in the mock engine).
- **Seed**: You can set up Faker.js seed with the `--faker-seed` flag. If not provided, Faker.js will not use a seed. By providing a seed value, you can generate repeatable sequences of fake data. Using seeding will not always generate the same value but rather a predictable sequence.

#### Customize the environment variables prefix

You can access environment variables in your routes' responses by using the [`{{getEnvVar 'VARIABLE_NAME'}}` templating helper](https://mockoon.com/docs/latest/variables/environment-variables/). By default, only the environment variables prefixed with `MOCKOON_` are available, for example, `MOCKOON_MY_VARIABLE` (this default prefix comes from the underlying engine).

You can customize the prefix with the `--env-vars-prefix` flag. For example, if you set `--env-vars-prefix CUSTOM_PREFIX_`, you will be able to access the environment variable `CUSTOM_PREFIX_MY_VARIABLE` in your routes' responses. To disable the prefix, set it to an empty string: `--env-vars-prefix ''` or `--env-vars-prefix=`.

#### Disabling routes

You can disable routes at runtime by providing their UUIDs or a keyword present in the route's path (do not include a leading slash). You can also disable all the routes present in a folder (including subfolders) by adding a keyword present in a folder name.

For example, to disable all routes in a folder named `folder1`, and all routes having "users" in their paths, you can use `--disable-routes folder1 users`.

To disable all routes, use `--disable-routes=*` or `--disable-routes "*"`.

#### Background mode (detach)

Adding the `--detach` (`-D`) flag to `start` runs the mock(s) as a detached background process and frees your terminal immediately. The command prints the process PID and the path to the log file, then returns.

```bash
$ mocknroll start --data ~/data.json --detach
Mock API started in background (PID 12345) - logs at ~/.mocknroll/logs/detach.log
```

Notes:

- Only a single background daemon runs at a time. A second `start --detach` reports that a mock is already running (exit code `1`) instead of starting a concurrent instance.
- The detached process's output (boot, errors, and transactions when `--log-transaction` is set) is always written to the fixed path `~/.mocknroll/logs/detach.log`, truncated on every `start --detach`. The per-environment structured logs (`~/.mocknroll/logs/<env>.log`) are unaffected.
- All `start` flags are inherited, including `--watch`, multiple `--data`/`--port` entries, etc.
- Background mode is supported on Linux and macOS. On Windows the command prints a "not supported yet" message.
- `--detach` is incompatible with `--repair`, and any data file requiring migration/repair is refused (no interactive prompt can run without a terminal).

Use [`stop`](#stop-command) to shut the daemon down and [`status`](#status-command) to inspect it.

### `stop` command

Gracefully stops the background daemon started with [`start --detach`](#background-mode-detach). It takes no arguments and always exits `0` (safe to put before `start` in scripts).

It sends `SIGINT` for a graceful HTTP shutdown, polls for up to 3 seconds, then sends `SIGKILL` if the process is still alive. If nothing is running, it reports so and exits cleanly.

**Usage**:
`$ mocknroll stop`

### `status` command

Reports whether a background daemon is running. When one is running, it prints its metadata (PID, ports, data files, start time, watch mode) and the log paths, and exits `0`. When nothing is running, it reports "stopped" and exits `3` (usable in shell conditionals).

**Usage**:
`$ mocknroll status`

### `dockerize` command

Generates a Dockerfile used to build a self-contained image of one or more mock API. After building the image, no additional parameters will be needed when running the container.
This command takes similar flags as the [`start` command](#start-command).
The `--disable-log-to-file` flag will be enabled by default in the resulting Dockerfile.

Please note that this command will copy the environment files you provide with the `--data` flag and put them side by side with the generated Dockerfile.

**Usage**:
`$ mocknroll dockerize`

**Options**:
|Flag|Description|
|-|-|
|-d, --data | [required] Path or URL to your environment file|
|-p, --port | [required] Ports to expose in the Docker container. It should match the number of environment data files you provide with the --data flag.|
|-o, --output | [required] Generated Dockerfile path and name (e.g. `./folder/Dockerfile`)|
|-t, --log-transaction | Log the full HTTP transaction (request and response)|
|-h, --help | Show CLI help|

**Examples**:

```bash
$ mocknroll dockerize --data ~/data.json --output ./Dockerfile
$ mocknroll dockerize --data ~/data1.json ~/data2.json --output ./Dockerfile
$ mocknroll dockerize --data https://file-server/data.json --output ./Dockerfile
```

Then build and run the generated image:

```bash
$ cd <output-folder>
$ docker build -t mocknroll-image .
$ docker run -d -p <host_port>:3000 mocknroll-image
```

### `import` command

Import a Swagger v2/OpenAPI v3 specification file (YAML or JSON).

The output file will not be prettified by default. You can prettify it using the `--prettify` flag described below.

**Usage**:
`$ mocknroll import`

**Options**:
|Flag|Description|
|-|-|
|-i, --input [required] |Path or URL to your Swagger v2/OpenAPI v3 file|
|-o, --output [required] |Generated environment file path and name (e.g. `./environment.json`)|
|-p, --prettify |Prettify output|
|-h, --help |Show CLI help|

**Examples**:

```bash
$ mocknroll import --input ~/input.json --output ./output.json
$ mocknroll import --input ~/input.yaml --output ./output.json
$ mocknroll import --input ~/input.json --output ./output.json --prettify
```

### `export` command

Export a mock API to an OpenAPI v3 specification file (JSON or YAML).

The output file will not be prettified by default for JSON. You can prettify it using the `--prettify` flag described below.

**Usage**:
`$ mocknroll export`

**Options**:
|Flag|Description|
|-|-|
|-i, --input [required] |Path or URL to your environment data file|
|-o, --output [required] |Generated OpenApi v3 path and name (e.g. `./output.json`)|
|-f, --format |Output format, "json" or "yaml" (default: "json")|
|-p, --prettify |Prettify output (JSON only)|
|-h, --help |Show CLI help|

**Examples**:

```bash
$ mocknroll export --input ~/input.json --output ./output.json
$ mocknroll export --input ~/input.json --output ./output.json --prettify
$ mocknroll export --input ~/input.json --output ./output.yaml --format yaml
```

### `validate` command

Validate an [environment JSON file](https://mockoon.com/docs/latest/mockoon-data-files/data-files-location/#data-files-schema) against the schema:

```sh
$ mocknroll validate --data ~/data1.json ~/data2.json
$ mocknroll validate --data https://file-server/data.json
```

> 💡 The `--data` flag behaves like the `--data` flag in the `start` command, meaning you can provide multiple paths or URLs to validate multiple files at once.

If the files are valid, you will see:

```
✓ Valid environment: ~/data1.json
✓ Valid environment: ~/data2.json
✓ All environments are valid
```

If one or more files are invalid, you will see validation errors:

```
Invalid environment: ~/data1.json
- "name" is required
- "port" must be a number
Invalid environment: ~/data2.json
- "routes" must be an array
 »   Error: Environments validation failed
```

> ⚠️ This command does not validate the OpenAPI specification files. OpenAPI files are validated by the [`start` command](#start-command) when you run it with an OpenAPI file as the `--data` parameter.

### `help` command

Returns information about a command.

**Usage**:
`$ mocknroll help [COMMAND]`

**Arguments and options**:
|Flag|Description|
|-|-|
|COMMAND |command to show help for|
|--all |see all commands in CLI|

## Logs

Logs are located in `~/.mocknroll/logs/{mock-name}.log`. This file contains all the log entries (all levels) produced by the running mock server. Most of the errors occurring in the CLI are not critical and are therefore considered as normal output. As an example, if the JSON body from an entering request is erroneous, the server will log a JSON parsing error, but it won't block the normal execution.

When running in the foreground, logs are also sent to stdout (console). In background mode (`--detach`), the process output goes to `~/.mocknroll/logs/detach.log` instead.

### Transaction logging

When using the `--log-transaction` flag, logs will contain the full transaction (request and response). Example entry (the `"app": "mockoon-server"` field comes from the underlying mock-server engine):

```json
{
  "app": "mockoon-server",
  "level": "info",
  "message": "Transaction recorded",
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "environmentName": "Demo API",
  "environmentUUID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "requestMethod": "GET",
  "requestPath": "/test",
  "requestProxied": false,
  "responseStatus": 200,
  "transaction": {
    "proxied": false,
    "request": {
      "body": "{}",
      "headers": [{ "key": "accept", "value": "*/*" }],
      "method": "GET",
      "params": [],
      "query": "",
      "queryParams": {},
      "route": "/test",
      "urlPath": "/test"
    },
    "response": {
      "body": "{}",
      "headers": [
        { "key": "content-type", "value": "application/json; charset=utf-8" }
      ],
      "statusCode": 200,
      "statusMessage": "OK"
    },
    "routeResponseUUID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "routeUUID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

### Disable logging

You can disable logging to the console by redirecting the stdout and stderr outputs:

- Unix:

  ```sh
  mocknroll start --data ./data.json > /dev/null 2>&1
  ```

  or:

  ```sh
  mocknroll start --data ./data.json &> /dev/null
  ```

- Windows (cmd):

  ```sh
  mocknroll start --data ./data.json 2> NUL
  ```

  or:

  ```sh
  mocknroll start --data ./data.json > NUL 2>&1
  ```

- Windows (PowerShell):

  ```sh
  mocknroll start --data ./data.json 2> $null
  ```

  or:

  ```sh
  mocknroll start --data ./data.json > $null 2>&1
  ```

You can also disable file logging by using the `--disable-log-to-file` flag.
