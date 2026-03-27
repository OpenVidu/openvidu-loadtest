# OpenVidu Load Test - Agent Instructions

## Project Architecture

This is a distributed load testing system for OpenVidu video conferencing platform with two main components:

### Loadtest Controller (Java/Spring Boot)

- **Location**: `/loadtest-controller/`
- **Purpose**: Orchestrates load tests by coordinating browser-emulator workers
- **Key directories**:
  - `src/main/java/io/openvidu/loadtest/` - Main application code
  - `src/main/java/io/openvidu/loadtest/services/` - Core business logic (BrowserEmulatorClient, LoadTestService)
  - `src/main/java/io/openvidu/loadtest/models/` - Data models (TestCase, etc.)
  - `src/main/java/io/openvidu/loadtest/config/` - Configuration handling
  - `src/main/java/io/openvidu/loadtest/utils/` - Utility classes

### Browser Emulator (Node.js/TypeScript)

- **Location**: `/browser-emulator/`
- **Purpose**: Worker service that launches browsers (Chrome/Firefox) to connect to OpenVidu sessions
- **Key directories**:
  - `src/services/` - Core services (BrowserManagerService, SeleniumService, ConfigService)
  - `src/controllers/` - Express REST controllers
  - `src/com-modules/` - Communication modules (OpenVidu, LiveKit)
  - `src/repositories/` - Data persistence layers
  - `tests/` - Unit, integration, e2e, and QoE tests

### Test Orchestration Flow

1. Loadtest Controller reads `config/config.yaml`
2. Controller distributes test cases to browser-emulator workers via WebSocket
3. Browser-emulator launches Selenium-controlled browsers
4. Browsers connect to OpenVidu and execute test scenarios (N:N, N:M, TEACHING, ONE_SESSION)
5. Results collected in `/results/` directory

### Docker Support

- `docker-compose.yml` - Main compose file for local testing
- `/browser-emulator/docker-compose.test.yml` - Test-specific compose
- `/e2e-tests/docker-compose.yml` - E2E test compose

## Build/Lint/Test Commands

### Browser Emulator (Node.js)

```bash
# Install dependencies
pnpm install

# Build
pnpm run build          # Compile TypeScript to dist/

# Lint
pnpm run lint           # ESLint for src/, tests/, dev_scripts/
pnpm run lint:fix       # Auto-fix lint issues

# Format
pnpm run format         # Prettier formatting

# Tests (using Vitest)
pnpm test               # Run all tests (unit + integration + e2e)
pnpm run test:unit      # Unit tests only
pnpm run test:integration  # Integration tests only
pnpm run test:e2e       # E2E tests only
pnpm run test:qoe       # QoE analysis tests
pnpm run test:coverage  # With coverage report

# Run single test file
npx vitest run tests/unit/path/to/test.test.ts

# Run tests by project name
npx vitest run --project=unit --project=integration
```

### Loadtest Controller (Java/Maven)

```bash
cd loadtest-controller

# Build
mvn clean package    # Build JAR with Maven wrapper

# Run tests
mvn test             # Run all tests
mvn test -Dtest=TestClass#testMethod  # Run single test

# Run application
mvn spring-boot:run  # Start the controller
```

### E2E Tests (Docker-based)

```bash
cd e2e-tests

# Run smoke test (requires OpenVidu instance)
./scripts/run-smoke-test.sh <PLATFORM_URL> [APIKEY] [APISECRET]

# Direct Docker Compose
docker-compose up --build
```

## Code Style Guidelines

### TypeScript/JavaScript (Browser Emulator)

- **Imports**: Use ES modules (`import/export`), prefer named exports
- **Formatting**: Prettier with tabs, single quotes, trailing commas (see `.prettierrc`)
  - Tab width: 4
  - Single quotes: true
  - Trailing commas: all
  - Arrow parens: avoid
- **Types**: Use TypeScript strict mode, prefer interfaces over types for object shapes
- **Naming**:
  - Classes: PascalCase (e.g., `BrowserManagerService`)
  - Functions/variables: camelCase (e.g., `getContainer()`)
  - Constants: UPPER_SNAKE_CASE
  - Files: kebab-case with `.service.ts`, `.controller.ts` suffixes
- **Error handling**: Use try-catch with specific error types, avoid empty catches
- **DI Pattern**: Awilix container for dependency injection (see `src/container.ts`)
- **Async patterns**: Use async/await, prefer Promise.all for parallel operations

### Java (Loadtest Controller)

- **Imports**: Use explicit imports, avoid wildcards
- **Formatting**: Standard Java conventions, 4-space indentation
- **Types**: Use strong typing, prefer interfaces for abstraction
- **Naming**:
  - Classes: PascalCase (e.g., `LoadTestService`)
  - Methods/variables: camelCase
  - Constants: UPPER_SNAKE_CASE
  - Files: PascalCase matching class name
- **Error handling**: Use specific exceptions, log with SLF4J
- **Patterns**: Spring Boot conventions, constructor injection

### Testing Conventions

- **Test file naming**: `*.test.ts` (browser-emulator), `*Test.java` (controller)
- **Test structure**: Arrange-Act-Assert pattern
- **Mocks**: Use Vitest `vi.fn()` for TypeScript, Mockito for Java
- **Setup**: Global setup files in `tests/setup/`
- **Timeouts**: 10 minutes for integration/E2E tests (600000ms)

## Mandatory Development Rules

When implementing changes in this repository, agents MUST follow these rules:

### 1. Run Tests After Changes

- **Browser-emulator changes**: Run `pnpm run test:unit` and `pnpm run test:integration` after modifications
- **Loadtest-controller changes**: Run `mvn test` after Java modifications

### 2. Lint Requirements (Browser-emulator only)

When modifying browser-emulator code:

1. Run `pnpm run lint` to check for issues
2. Fix any lint errors before completing the task
3. Run `pnpm run lint:fix` for auto-fixable issues

### 3. Test Coverage

- Create or update unit tests for any new functionality
- If behavior changes, update relevant test files
- All unit test suites must remain passing

### 4. Documentation Updates

- Update `README.md` if setup, usage, or architecture changes
- Update `AGENTS.md` if new commands, build steps, or conventions are introduced
- Document new configuration options in README or docs/

### 5. Pre-commit Checklist

Before finalizing any task:

- [ ] Unit tests pass for the affected subproject
- [ ] Linter passes (browser-emulator only)
- [ ] Code follows project naming conventions
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed

## Configuration Files

- `config/config.yaml` - Main test configuration
- `config/config-aws.yaml` - AWS deployment config
- `config/config-all.yaml` - All options example

## Key Environment Variables

- `LOADTEST_CONFIG` - Path to config file (default: `/config/config.yaml`)
- `PLATFORM_URL`, `PLATFORM_APIKEY`, `PLATFORM_APISECRET` - Override config values

## Useful Docker Commands

```bash
# Start full system
docker compose up --build

# View logs
docker compose logs -f

# Run tests in Docker
docker compose -f browser-emulator/docker-compose.test.yml up --build --abort-on-container-exit

# Stop services
docker compose down
```
