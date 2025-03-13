export class RC4Random {
    private buf: Uint8Array = new Uint8Array(256)

    public srand(key: string): void {
        let j = 0
        for (let i = 0; i < this.buf.length; i++) {
            this.buf[i] = i
        }
        for (let i = 0; i < this.buf.length; i++) {
            j = (j + this.buf[i] + key.charCodeAt(i % key.length)) % this.buf.length
            let t = this.buf[j]
            this.buf[j] = this.buf[i]
            this.buf[i] = t
        }
    }

    public rand(size: number): Uint8Array {
        let i = 0, j = 0, f, out = new Uint8Array(size)
        for (let k = 0; k < size; k++) {
            i++
            j = (j + this.buf[i]) % this.buf.length
            let t = this.buf[j]
            this.buf[j] = this.buf[i]
            this.buf[i] = t
            f = (this.buf[i] + this.buf[j]) % this.buf.length
            out[k] = this.buf[f]
        }
        return out
    }

    public nonce(bitnes: number = 256): bigint {
        const l = Math.ceil(bitnes / 8)
        const n = BigInt(l * 8)
        return toInt(this.rand(l)) % n
    }
}

export function toHex(buf: Uint8Array) {
    let t = 0n;
    for (let i = 0; i < buf.length; i++) {
        t = (t << 8n) + BigInt(buf[i])
    }
    return t.toString(16)
}
export function toInt(buf: Uint8Array): bigint {
    let t = 0n;
    for (let i = 0; i < buf.length; i++) {
        t = (t << 8n) + BigInt(buf[i])
    }
    return t
}