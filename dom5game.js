
const fs = require("fs");
const rw = require("./reader_writer.js");
const provCountFn = require("./province_count_module.js");
const timerParser = require("./timer_parser.js");
const kill = require("./kill_instance.js").kill;
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
  rw.getDirFilenames(config.dom5DataPath + "/mods", ".dm", function(err, filenames)
  {
    if (err)
    {
      cb(err, null);
    }

    else cb(null, filenames);
  });
};

module.exports.getMapList = function(cb)
{
  rw.readDirContent(config.dom5DataPath + "/maps", ".map", function(err, data)
  {
    if (err)
    {
      cb(err, null);
      return;
    }

    for (var filename in data)
    {
      var provinces = provCountFn(data[filename]);

      if (provinces == null)
      {
        continue;
      }

      data[filename] = provinces;
    }

    cb(null, data);
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
      rw.logError({data: data, path: path}, `fs.writeFile Error:`, err);
      cb(err);
    }

    else cb(null);
  });
}

module.exports.restart = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;

  rw.deleteDirContents(path, ["", ".2h", ".trn"], function(err)
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
        cb(`The data was restarted, but the game's process could not be killed to reboot it. Try to use the kill command to do so manually.`);
        return;
      }

      //ignore this because the statuspage file deletion is not critical;
      //even if it remains it will be overwritten
      /*fs.unlink(`${config.statusPageBasePath}/${game.name}_status`, function(err)
      {
        if (err)
        {
          cb(`The data was restarted, but the old statuspage file could not be deleted. Try to reboot the game by using the kill and launch commands to do so manually.`);
          return;
        }*/

        spawn(game.port, game.args, game, function(err)
        {
          if (err)
          {
            cb(`The data was restarted, but the game's process could not be launched after killing it. Try to use the launch command to do so manually.`);
          }

          else cb(null);
        });
      //});
    });
  });
};

//Expects data.timer to be a number expressed in seconds, since that's what
//the domcmd command "settimeleft" uses.
module.exports.changeCurrentTimer = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/domcmd`;
  var timer = timerParser.getTotalSeconds(data.timer);

  fs.writeFile(path, "settimeleft " + timer, function(err)
  {
    if (err)
    {
      rw.logError({data: data, path: path}, `fs.writeFile Error:`, err);
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

  fs.writeFile(path, "setinterval " + data.timer + "\nsettimeleft " + data.currentTimer, function(err)
  {
    if (err)
    {
      rw.logError({data: data, path: path}, `fs.writeFile Error:`, err);
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

	if (dump == null)
	{
		cb("Could not get the status dump information.", null);
    return;
	}

  for (var filename in dump)
  {
    var nation = dump[filename];

    if (nation.controller === 1)
    {
      //include both the filename and the nation name in the list, as
      //required by the master server.
      nationList.push({name: nation.nationName, filename: filename});
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
      rw.logError({data: data, path: path}, `fs.unlink Error:`, err);
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
  var path = config.dom5DataPath + "/savedgames/" + game.name;
  var files = fs.readdirSync(path, "utf8");
  var dump;

  if (files == null)
  {
    rw.logError({data: data, path: path}, `Directory does not exist.`);
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

    stats = fs.statSync(`${config.dom5DataPath}/savedgames/${game.name}/${filename}`);

    if (stats == null)
    {
      rw.logError({data: data, path: `${config.dom5DataPath}/savedgames/${game.name}/${filename}`}, `File stats do not exist?.`);
      cb(`An error occurred while checking the stats of the file ${filename} for stales for the game ${game.name}.`);
      return;
    }

    //A 2 in the controller of the nation means that the nation just went AI this processed turn
    if (dump[files[i]].controller == 2)
    {
      aiArray.push(dump[filename].nationName);
      continue;
    }

    //Not a stale, since the last modified time of the file is more recent than the last turn hosted
    //or the controller is an AI, not a human
    if (dump[files[i]].controller != 1 || dump[files[i]].turnPlayed === 1 || dump[files[i]].turnPlayed === 1 || stats.mtime.getTime() >= data.lastHostedTime)
    {
      continue;
    }

    //stale
    staleArray.push(dump[files[i]].nationName);
  }

  cb(null, {ai: aiArray, stales: staleArray});
};

module.exports.getDump = function(data, cb)
{
  var dump = parseDump(games[data.port].name);

  if (dump == null)
  {
    cb("Could not gather data from the dump file. Is the path incorrect?", null);
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
    var nationName = nationFilenameStart.slice(nationFilenameStart.search(/\s+/)).trim().replace("\t", ", ");
    dumpObj[nationFilename] = {};
    lineNumbers = lines[i].match(/\-?\d+/g);
    dumpObj[nationFilename].nationName = nationName;

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
