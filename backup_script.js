require("./prototype_functions.js");
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const preexecRegex = new RegExp("^\\-\\-preexec$", "i");
const postexecRegex = new RegExp("^\\-\\-postexec$", "i");

var gameName = process.argv[2];
var type = process.argv[3];
var source = `${config.dom5DataPath}/savedgames/${gameName}`;
var target = `${config.pathToGameSaveBackup}/`;
var turn;

rw.log(["backup"], `Backup type ${type} for ${gameName} starting.`);

if (gameName == null)
{
  rw.log(["error", "backup"], true, `No game name argument received.`);
}

if (preexecRegex.test(type) === true)
{
  target += `${config.latestTurnBackupDirName}/${gameName}/`;
}

else if (postexecRegex.test(type) === true)
{
  target += `${config.newTurnsBackupDirName}/${gameName}/`;
}

else
{
  rw.log(["error", "backup"], true, `Backup type received is invalid; expected --preexec or --postexec: ${type}`);
  return;
}

fs.readFile(`${config.statusPageBasePath}/${gameName}_status`, "utf8", (err, content) =>
{
  if (err)
  {
    rw.log(["error", "backup"], true, `Error occurred while reading file ${config.statusPageBasePath}/${gameName}_status:`, err);
    return;
  }

  content = content.match(/turn \d+/i);

  if (content[0] == null)
  {
    rw.log(["error", "backup"], true, `Content matched is incorrect: ${content}`);
    return;
  }

  turn = content[0].replace(/\D+/gi, "");

  if (isNaN(+turn) === true)
  {
    rw.log(["error", "backup"], true, `Turn parsed is incorrect: ${turn}`);
    return;
  }

  //statuspages don't update fast enough to give the new turn number right after
  //the turn processes, therefore add 1 to it
  if (postexecRegex.test(type) === true)
  {
    turn++;
  }

  target += `Turn ${turn}`;

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], function(err)
  {
    if (err)
    {
      rw.log(["error", "backup"], true, `Error occurred while copying dir ${source} to ${target}.`);
    }

    rw.log("backup", `${gameName}'s ${type} Turn ${turn} backed up successfully.`);
  });
});
