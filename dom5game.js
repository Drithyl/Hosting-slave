
const fs = require("fs");
const rw = require("./reader_writer.js");
const provCountFn = require("./province_count_module.js");
const timerParser = require("./timer_parser.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;
const config = require("./config.json");
var games;

module.exports.init = function(gameList)
{
  games = gameList;
  return this;
}

module.exports.getModList = function(cb)
{
  rw.getDirFilenames(`${config.dom5DataPath}/mods`, ".dm", cb);
};

module.exports.getMapList = function(cb)
{
  let provCountList = [];

  rw.readDirContent(config.dom5DataPath + "/maps", ".map", function(err, list)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    list.forEach((file) =>
    {
      let provs = provCountFn(file.content);

      if (provs != null)
      {
        provCountList.push({name: file.filename, ...provs});
      }
    });

    cb(null, provCountList);
  });
};

module.exports.getTurnFile = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${data.name}/${data.nationFilename}`;

  if (fs.existsSync(path) === false)
  {
    rw.logError({data: data, path: path}, `File does not exist.`);
    cb(`The file for this nation does not exist.`);
    return;
  }

  fs.stat(path, function(err, stats)
  {
    if (err)
    {
      rw.logError({data: data, path: path}, `fs.stat Error:`, err);
      cb(`Could not check the file size.`);
      return;
    }

    let sizeInMB = stats.size / 1000000.0;

    //Discord only supports attachments of up to 8MB without Nitro
    if (sizeInMB > 8)
    {
      cb(`The turn file weighs ${sizeInMB}MB. It is too big to be sent on Discord without a Nitro account.`);
      return;
    }

    //read the file as a buffer to send it back to the server so it can be attached to a message
    fs.readFile(path, function(err, buffer)
    {
      if (err)
      {
        rw.logError({data: data, path: path}, `fs.readFile Error:`, err);
        cb(`The contents of the turn file could not be read.`);
        return;
      }

      cb(null, buffer);
    });
  });
};

module.exports.getScoreDump = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${data.name}/scores.html`;

  if (fs.existsSync(path) === false)
  {
    rw.logError({data: data, path: path}, `File does not exist`);
    cb(`The score dump file for this game does not exist or cannot be found.`);
    return;
  }

  fs.stat(path, function(err, stats)
  {
    if (err)
    {
      rw.logError({data: data, path: path}, `fs.stat Error:`, err);
      cb(`Could not check the file size.`);
      return;
    }

    let sizeInMB = stats.size / 1000000.0;

    //Discord only supports attachments of up to 8MB without Nitro
    if (sizeInMB > 8)
    {
      cb(`The score file weighs ${sizeInMB}MB. It is too big to be sent on Discord.`);
      return;
    }

    //read the file as a buffer to send it back to the server so it can be attached to a message
    fs.readFile(path, function(err, buffer)
    {
      if (err)
      {
        rw.logError({data: data, path: path}, `fs.readFile Error:`, err);
        cb(`The contents of the score file could not be read.`);
        return;
      }

      cb(null, buffer);
    });
  });
};

module.exports.start = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/domcmd`;

  fs.writeFile(path, "settimeleft " + data.timer, function(err)
  {
    if (err)
    {
      rw.log("error", true, {data: data, path: path, err: err});
      cb(err);
    }

    else cb(null);
  });
}

module.exports.restart = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;

  rw.log("general", `Killing ${game.name}'s process...`);

  //kill game first so it doesn't automatically regenerate the statuspage file
  //as soon as it gets deleted
  kill(game, function(err)
  {
    if (err)
    {
      return cb(`The game's process could not be killed to do the necessary changes to restart it.`);
    }

    rw.log("general", `Checking for existing ${game.name}'s statuspage file...`);

    //if statuspage exists, it *must* be deleted, or else every timer check done before
    //the game starts again will return unreliable values which could have undesirable
    //side-effects (like if the bot goes down, it will freeze the game's timer and
    //then restore it later, causing an unrequested countdown to start, because the
    //old statuspage made it seem like the game was started)
    if (fs.existsSync(`${config.statusPageBasePath}/${game.name}_status`) === true)
    {
      try
      {
        fs.unlinkSync(`${config.statusPageBasePath}/${game.name}_status`);
        rw.log("general", `${game.name}'s statuspage file has been deleted.`);
      }

      catch(err)
      {
        rw.log("error", `${game.name}'s statuspage file could not be deleted:\n\n${err.message}`);
        return cb(`Dominions' statuspage could not be deleted. The game was not restarted but its process was shut down.`);
      }
    }

    rw.log("general", `Starting the atomic removal of savedgame files...`);

    //must delete statusdump.txt as well, otherwise when players type
    //!pretenders, it will read the old statusdump file and show existing
    //pretenders that have been deleted. atomicRmDir guarantees that either
    //all the necessary files get deleted or none of them does, thus
    //preserving the integrity of the savedgames folder. The "" in the filter
    //is necessary as the fthrlnd file that contains the main data has no extension
    rw.atomicRmDir(path, ["", ".2h", ".trn", ".txt", ".html"], function(err)
    {
      if (err)
      {
        rw.log("error", `Failed to remove savedgame files:\n\n${err.message}`);
        return cb(`Error when deleting save files. The game has not been restarted and is simply shut down. You can relaunch its process normally. Below is the error message:\n\n${err.message}`);
      }

      rw.log("general", `Removed files successfully. Spawning game's process...`);

      spawn(game.port, game.args, game, function(err)
      {
        if (err)
        {
          return cb(`The data was restarted, but the game's process could not be launched after killing it. Try to use the launch command to do so manually.`);
        }

        cb();
      });
    });
  });
};

//Expects data.timer to be a number expressed in seconds, since that's what
//the domcmd command "settimeleft" uses.
module.exports.changeCurrentTimer = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/domcmd`;

  fs.writeFile(path, "settimeleft " + data.timer, function(err)
  {
    if (err)
    {
      rw.log("error", {data: data, path: path, err: err});
      cb(err, null);
    }

    else cb(null);
  });
};

//Expects data.defaultTimer to be a number expressed in minutes, since that's what
//the domcmd command "setinterval" uses. It also needs data.currentTimer, in seconds,
//because setInterval also overrides the current timer, so it has to be re-set.
module.exports.changeDefaultTimer = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/domcmd`;
  var domcmd = `setinterval ${data.timer}\n`;

  //set currentTimer to what it was again, because setinterval changes the
  //current timer as well
  if (data.currentTimer != null)
  {
    domcmd += `settimeleft ${data.currentTimer}`;
  }

  fs.writeFile(path, domcmd, function(err)
  {
    if (err)
    {
      rw.log("error", {data: data, path: path, err: err});
      cb(err, null);
    }

    else cb(null);
  });
};

module.exports.getSubmittedPretenders = function(data, cb)
{
  var nationList = [];
  var game = games[data.port];
  var dump = parseDump(game.name);
  var savedPath = `${config.dom5DataPath}/savedgames/${game.name}`;

	if (dump == null)
	{
		cb("Could not get the status dump information.", null);
    return;
	}

  for (var filename in dump)
  {
    var nation = dump[filename];

    //must verify both that it's human controlled and that its file exists
    if (nation.controller === 1)
    {
      if (fs.existsSync(`${savedPath}/${filename}`) === false)
      {
        rw.log("error", `The nation ${filename} in the game ${game.name} is human controlled in the statusdump but its file does not exist. Perhaps the statusdump is old (from a restart?)`);
        continue;
      }

      //include both the filename and the nation name in the list, as
      //required by the master server.
      nationList.push({name: nation.nationName, fullName: nation.nationFullName, filename: filename, number: nation.nationNbr});
    }
  }

  cb(null, nationList);
};

module.exports.removePretender = function(data, cb)
{
  var game = games[data.port];
  var path = config.dom5DataPath + "/savedgames/" + game.name + "/" + data.nationFile;

	if (fs.existsSync(path) === false)
	{
		cb("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game.");
    return;
	}

  fs.unlink(path, function(err)
  {
    if (err)
    {
      rw.log("error", {data: data, path: path, err: err});
      cb(err, null);
    }

    else cb(null);
  });
};

module.exports.getStales = function(data, cb)
{
  var staleArray = [];
  var aiArray = [];
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;
  var files = fs.readdirSync(path, "utf8");
  var dump;

  if (files == null)
  {
    rw.log("error", true, `Directory does not exist.`, {data: data, path: path});
    cb(`An error occurred while reading the stats of the files from the game ${game.name} to check its stales. The error was:\n\n${err}`, null);
    return;
  }

  dump = parseDump(game.name);

  if (dump == null)
  {
    cb("The dump file could not be read. Stales cannot be verified.", null);
    return;
  }

  for (var i = 0; i < files.length; i++)
  {
    var stats;
    var filename = files[i];

    if (filename.slice(filename.indexOf(".")) !== ".2h")
    {
      continue;
    }

    try
    {
      stats = fs.statSync(`${config.dom5DataPath}/savedgames/${game.name}/${filename}`);
    }

    catch(err)
    {
      rw.log("error", true, {data: data, path: `${config.dom5DataPath}/savedgames/${game.name}/${filename}`, err: err});
      cb(`An error occurred while checking the stats of the file ${filename} for stales for the game ${game.name}.`);
      return;
    }

    //A 2 in the controller of the nation means that the nation just went AI this processed turn
    if (dump[files[i]].controller == 2)
    {
      aiArray.push({name: dump[filename].nationName, filename: dump[filename]});
      continue;
    }

    //Not a stale, since the last modified time of the file is more recent than the last turn hosted
    //or the controller is an AI, not a human
    if (dump[files[i]].controller != 1 || dump[files[i]].turnPlayed === 1 || dump[files[i]].turnPlayed === 2 || stats.mtime.getTime() >= data.lastHostedTime)
    {
      continue;
    }

    //stale
    staleArray.push({name: dump[filename].nationName, filename: dump[filename]});
  }

  cb(null, {ai: aiArray, stales: staleArray});
};

module.exports.getDump = function(data, cb)
{
  //var dump = parseDump(games[data.port].name);
  var dump = parseDump(games[data.port].name);

  if (dump == null)
  {
    cb("Could not gather data from the dump file. Is the path incorrect?");
  }

  else cb(null, dump);
};

module.exports.backupSavefiles = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.dom5DataPath}/savedgames/${game.name}`;
  var target = `${config.pathToGameSaveBackup}/`;

  if (data.isNewTurn === true)
  {
    target += `${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  }

  else target += `${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], cb);
};

module.exports.rollback = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.pathToGameSaveBackup}/${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  var target = `${config.dom5DataPath}/savedgames/${game.name}`;

  if (fs.existsSync(source) === false)
  {
    source = `${config.pathToGameSaveBackup}/${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

    if (fs.existsSync(source) === false)
    {
      cb(`No backup of the previous turn was found to be able to rollback.`);
      return;
    }
  }

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], function(err)
  {
    if (err)
    {
      cb(err);
      return;
    }

    kill(game, function(err)
    {
      if (err)
      {
        cb(`The files were successfully rollbacked, but the game task could not be killed to reboot it. Try using the kill command.`);
        return;
      }

      spawn(game.port, game.args, game, function(err)
      {
        if (err)
        {
          cb(`The files were successfully rollbacked, but the game task could not be launched after killing it. Try using the launch command.`);
          return;
        }

        else cb(null);
      });
    });
  });
};

module.exports.deleteGameSavefiles = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;

  fs.readdir(path, function(err, files)
  {
    if (err)
    {
      rw.logError({game: game.name, path: path}, `fs.readdir Error:`, err);
      cb(err, null);
      return;
    }

    files.forEach(function(file)
    {
      fs.unlinkSync(path + "/" + file);
    });

    fs.rmdirSync(path);
    cb(null, `${game.name}: deleted the dom save files.`);
  });
};

module.exports.getLastHostedTime = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/ftherlnd`;

  fs.stat(path, function(err, stats)
  {
    if (err)
    {
      rw.logError({data: data, path: path}, `fs.stat Error:`, err);
      cb(err, null);
    }

    else cb(null, stats.mtime.getTime());
  });
};

function parseDump(name)
{
  var dump;
  var lines;
  var lineNumbers = "";
  var dumpObj = {};
  var path = `${config.dom5DataPath}/savedgames/${name}/statusdump.txt`;

	if (fs.existsSync(path) === false)
	{
    rw.log("general", `Could not find the path of the dump data of ${name}`);
    return null;
	}

  dump = fs.readFileSync(path, "utf-8");

  lines = dump.split("\n");

  for (var i = 0; i < lines.length; i++)
  {
    //ignore the first two lines of the dump file
    if (/Nation/i.test(lines[i]) === false || /Status/i.test(lines[i]) === true)
    {
      continue;
    }

    var nationFilenameStart = lines[i].replace(/Nation\s+(\-?\d+\s+)+/, "");
    var nationFilename = nationFilenameStart.slice(0, nationFilenameStart.search(/\s+/)).trim() + ".2h";
    var nationFullName = nationFilenameStart.slice(nationFilenameStart.search(/\s+/)).trim().replace("\t", ", ");
    dumpObj[nationFilename] = {};
    lineNumbers = lines[i].match(/\-?\d+/g);
    dumpObj[nationFilename].filename = `${nationFilename}.2h`;

    dumpObj[nationFilename].nationFullName = nationFullName;
    dumpObj[nationFilename].nationName = nationFullName.slice(0, nationFullName.indexOf(","));

    //the nation number
    dumpObj[nationFilename].nationNbr = +lineNumbers[0];

    //The number of the pretender of this team (so if it's not the same as the nation nbr, this is a disciple)
    dumpObj[nationFilename].pretenderNbr = +lineNumbers[1];

    //Controller of the nation. 0 is ai, 1 is human, 2 is just went ai this turn
    dumpObj[nationFilename].controller = +lineNumbers[2];

    //From 0 to 5: easy, normal, difficult, mighty, master, impossible
    dumpObj[nationFilename].aiLevel = +lineNumbers[3];

    //0 is turn not checked, 1 is marked as unfinished, 2 is turn done
    dumpObj[nationFilename].turnPlayed = +lineNumbers[4];
  }

  return dumpObj;
}

function printNations(dump)
{
  var str = "";

  for (var nation in dump)
  {
    if (dump[nation].controller != 1)
    {
      continue;
    }

    str += (dump[nation].nationName + ": ").width(40) + nation + "\n";
  }

  return str.toBox();
}
