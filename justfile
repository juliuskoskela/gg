default:
    @just --list

setup:
    npm ci
    npm run build

# native window: Svelte hot reload and automatic Rust rebuilds
dev:
    npm run dev

# browser preview: run these in separate terminals
dev-frontend:
    npm run dev:frontend -- --open

dev-backend:
    npm run dev:backend

build:
    npm run tauri -- build --no-bundle

check:
    npm run check
    cargo clippy --locked
    cargo fmt --check

test:
    cargo test --locked
    npm test

fmt:
    cargo fmt
    alejandra flake.nix nix/
