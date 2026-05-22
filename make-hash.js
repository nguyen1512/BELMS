const bcrypt = require("bcryptjs");

const password = "123456";
const hash = bcrypt.hashSync(password, 10);

console.log(hash);
console.log("check:", bcrypt.compareSync(password, hash));