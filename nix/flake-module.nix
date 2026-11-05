{
  perSystem = {
    config,
    pkgs,
    lib,
    ...
  }: let
    nativeLibraries =
      [pkgs.openssl]
      ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [pkgs.webkitgtk_4_1];
  in {
    packages.default = config.packages.gg;
    packages.gg = pkgs.callPackage ./package.nix {};
    apps.default = {
      type = "app";
      program = lib.getExe config.packages.gg;
      meta.description = "Launch GG";
    };
    formatter = pkgs.alejandra;

    devShells.default = pkgs.mkShell {
      name = "gg-dev";
      packages = with pkgs; [
        cargo
        rustc
        rustfmt
        clippy
        rust-analyzer
        cargo-watch
        nodejs_24
        pkg-config
        git
        unzip
        jujutsu
        just
        alejandra
      ];
      buildInputs = nativeLibraries;
      nativeBuildInputs = lib.optionals pkgs.stdenv.hostPlatform.isLinux [pkgs.wrapGAppsHook3];
      env.OPENSSL_NO_VENDOR = "1";

      shellHook = ''
        ${lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
          export XDG_DATA_DIRS="${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:''${XDG_DATA_DIRS:-}"
          export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules''${GIO_EXTRA_MODULES:+:$GIO_EXTRA_MODULES}"
        ''}
        echo "GG development shell — run 'just setup', then 'just dev' for hot reload."
      '';
    };
  };
}
