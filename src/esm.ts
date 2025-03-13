export let getPublicKey,
    etc,
    verify,
    sign

console.log("imported1")
import("@noble/secp256k1").then(mod => {
    getPublicKey = mod.getPublicKey
    etc = mod.etc
    verify = mod.verify
    sign = mod.sign
    console.log("imported")
})