{
  lib,
  stdenv,
  rustPlatform,
  fetchNpmDeps,
  cargo-tauri,
  nodejs_24,
  npmHooks,
  pkg-config,
  wrapGAppsHook3,
  openssl,
  webkitgtk_4_1,
  gitMinimal,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "gg";
  version = (lib.importTOML ../Cargo.toml).package.version;
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../.cargo
      ../Cargo.toml
      ../Cargo.lock
      ../build.rs
      ../Tauri.toml
      ../src
      ../app
      ../res
      ../e2e
      ../index.html
      ../package.json
      ../package-lock.json
      ../svelte.config.js
      ../tsconfig.json
      ../tsconfig.node.json
      ../vite.config.ts
      ../LICENSE
      ../README.md
    ];
  };
  cargoHash = "sha256-LuFU7sZQ2FFlqTP2DTOPM59/l7v1ZBPgWhSrmJvX6i4=";
  npmDeps = fetchNpmDeps {
    inherit (finalAttrs) src;
    hash = "sha256-Jni1XaA+mVyLon48TWEFvEXwCZ7MRuViW24+Xi/kQbI=";
  };
  nativeBuildInputs =
    [cargo-tauri.hook nodejs_24 npmHooks.npmConfigHook pkg-config]
    ++ lib.optionals stdenv.hostPlatform.isLinux [wrapGAppsHook3];
  buildInputs = [openssl] ++ lib.optionals stdenv.hostPlatform.isLinux [webkitgtk_4_1];
  nativeCheckInputs = [gitMinimal];
  env.OPENSSL_NO_VENDOR = "1";
  checkFlags = lib.optionals stdenv.hostPlatform.isDarwin ["--skip=web::tests::integration_test"];
  postInstall = lib.optionalString stdenv.hostPlatform.isDarwin ''
    mkdir -p $out/bin
    ln -s $out/Applications/gg.app/Contents/MacOS/gg $out/bin/gg
  '';
  meta = {
    description = "Desktop interface for Jujutsu";
    homepage = "https://github.com/juliuskoskela/gg";
    license = lib.licenses.asl20;
    mainProgram = "gg";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
