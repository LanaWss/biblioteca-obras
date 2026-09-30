const webpush = require("web-push");

const chaves = webpush.generateVAPIDKeys();

console.log("PUBLIC KEY:");
console.log(chaves.publicKey);

console.log("\nPRIVATE KEY:");
console.log(chaves.privateKey);