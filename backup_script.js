require("./prototype_functions.js");
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const timerParser = require("./timer_parser.js");
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

timerParser.getTurnInfo(gameName, function(err, timer)
{
  if (err)
  {
    rw.log(["error", "backup"], true, `Error occurred while parsing timer:\n\n${err.message}`);
    return;
  }

  //statuspages don't update fast enough to give the new turn number right after
  //the turn processes, therefore add 1 to it
  if (postexecRegex.test(type) === true)
  {
    timer.turn++;
  }

  target += `Turn ${timer.turn}`;

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], function(err)
  {
    if (err)
    {
      rw.log(["error", "backup"], true, `Error occurred while copying dir ${source} to ${target}.`);
    }

    rw.log("backup", `${gameName}'s ${type} Turn ${turn} backed up successfully.`);
  });
});
