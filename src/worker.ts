import { Sharer } from "./sharer";
import { WASI, Directory, PreopenDirectory, Fd, File } from "./wasi";
// import { Directory, PreopenDirectory, Fd, File } from "wasi"
import { Iovec } from "@bjorn3/browser_wasi_shim/typings/wasi_defs";
import { untar } from "@immutabl3/tar";
// @ts-ignore
import zlsWasm from "url:./zls.wasm";
// @ts-ignore
import zigTar from "url:./zig.tar.gz";
import { ungzip } from "pako";

let sharer: Sharer = new Sharer();

enum StdioKind {
    stdin = "stdin",
    stdout = "stdout",
    stderr = "stderr",
}

class Stdio extends Fd {
    kind: StdioKind;
    buffer: number[];

    constructor(kind: StdioKind) {
        super();
        this.kind = kind;
        this.buffer = [];
    }

    fd_write(view8: Uint8Array, iovs: Iovec[]): { ret: number; nwritten: number; } {
        let nwritten = 0;
        for (let iovec of iovs) {
            const slice = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);

            if (this.kind == StdioKind.stdin) {
                throw new Error("Cannot write to stdin");
            } else if (this.kind == StdioKind.stdout) {
                this.buffer = this.buffer.concat(Array.from(slice));
                
                while (true) {
                    const data = new TextDecoder("utf-8").decode(Uint8Array.from(this.buffer));

                    if (!data.startsWith("Content-Length: ")) break;
                    
                    const len = parseInt(data.slice("Content-Length: ".length));
                    const bodyStart = data.indexOf("\r\n\r\n") + 4;

                    if (bodyStart === -1) break;
                    if (this.buffer.length < bodyStart + len) break;
                    
                    this.buffer.splice(0, bodyStart + len);
                    postMessage(JSON.parse(data.slice(bodyStart, bodyStart + len)));
                }
            } else {
                this.buffer.push(...slice);

                while (this.buffer.indexOf(10) !== -1) {
                    let data = new TextDecoder("utf-8").decode(Uint8Array.from(this.buffer.splice(0, this.buffer.indexOf(10) + 1)));
                    console.log("stderr", data);
                    postMessage({
                        stderr: data,
                    });
                }
            }

            nwritten += iovec.buf_len;
        }
        return { ret: 0, nwritten };
    }

    fd_read(view8: Uint8Array, iovs: Iovec[]): { ret: number; nread: number; } {
        if (this.kind != StdioKind.stdin) throw new Error("Cannot read from non-stdin");

        let nread = 0;
        if (sharer.index === 0) {
            Atomics.store(new Int32Array(sharer.stdinBlockBuffer), 0, 0);
            Atomics.wait(new Int32Array(sharer.stdinBlockBuffer), 0, 0);
        }

        sharer.lock();

        for (let iovec of iovs) {
            const read = Math.min(iovec.buf_len, sharer.index);
            const sl = new Uint8Array(sharer.dataBuffer).slice(0, read);

            view8.set(sl, iovec.buf);
            new Uint8Array(sharer.dataBuffer).set(new Uint8Array(sharer.dataBuffer, read), 0);

            sharer.index -= read;
            
            nread += read;
        }

        sharer.unlock();

        return { ret: 0, nread };
    }
}

const stdin = new Stdio(StdioKind.stdin);

onmessage = (event) => {
    sharer.indexBuffer = event.data.indexBuffer;
    sharer.lockBuffer = event.data.lockBuffer;
    sharer.stdinBlockBuffer = event.data.stdinBlockBuffer;
    sharer.dataBuffer = event.data.dataBuffer;
};

async function getLatestZigArchive() {
    const archive = await (await fetch(zigTar, {})).arrayBuffer();
    const entries = await untar(ungzip(archive));

    const first = entries[0].path;

    let dirs = new Directory({});

    for (const e of entries) {
        if (e.type === "file") {
            const path = e.path.slice(first.length);
            const splitPath = path.split("/");

            let c = dirs;
            for (const segment of splitPath.slice(0, -1)) {
                if (!c.contents.has(segment)) c.contents.set(segment, new Directory({}));
                c = c.contents.get(segment) as Directory;
            }

            c.contents.set(splitPath[splitPath.length - 1], new File(e.getBinary()));
        }
    }

    return dirs;
}

(async () => {
    let libStd = await getLatestZigArchive();

    const wasmResp = await fetch(zlsWasm);
    const wasmData = await wasmResp.arrayBuffer();

    let args = ["zls.wasm", "--enable-debug-log"];
    let env = [];
    let fds = [
        stdin, // stdin
        new Stdio(StdioKind.stdout), // stdout
        new Stdio(StdioKind.stderr), // stderr
        new PreopenDirectory(".", {
            "zls.wasm": new File(wasmData),
            "lib": new Directory({
                "std": libStd,
            }),
        }),
    ];
    let wasi = new WASI(args, env, fds);

    let wasm = await WebAssembly.compile(wasmData);
    let inst = await WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi.wasiImport,
    });  
    wasi.start(inst);
})();
