# Zig Playground

This is a fork of [zigtools/playground](https://github.com/zigtools/playground).

**[Demo](https://eliot-akira.github.io/zig-playground) · [Git repo](https://github.com/eliot-akira/zig-playground)**

Changes include:

- Build a static siste hosted on GitHub Pages
- Deploy using GitHub Actions
- Redesign interface and improve editor with syntax highlight
- Bundle built WASM files

## Prepare

- [ ] Compile zig compiler for `wasm32-wasi` and place `zig_release.wasm` in `src`

- [x] Compile zls for `wasm32-wasi` and place `zls.wasm` in `src`

  Or download `zls-wasm32-wasi.tar.xz ` from [releases](https://github.com/zigtools/zls/releases).

- [x] Place `zig.tar.gz` from the website in `src`

  If you've downloaded Zig and built from source following [`zig-wasm.md`](zig-wasm.md), you can also use this command:

  ```bash
  tar -C /path/to/zig -cz lib/std > src/zig.tar.gz
  ```

## Develop

Install dependencies.

```sh
npm install
```

Serve local site - Build assets, watch for changes. Press CTRL + C to stop.

```sh
npm run serve
```

Build for production.

```sh
npm run build
```
