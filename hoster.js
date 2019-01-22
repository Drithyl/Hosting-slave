
const fs = require("fs");
const rw = require("./reader_writer.js");
const config = require("./config.json");
var gameHub;
var reservedPorts = [];

module.exports.init = function(gameHubModule)
{
  gameHub = gameHubModule;
  return this;
};

module.exports.reservePort = function(cb)
{
  var reservedPort = config.gamePortRange.first.toString();
  var usedPorts = gameHub.getUsedPorts().concat(reservedPorts);

  while (usedPorts.includes(reservedPort.toString()) === true)
  {
    reservedPort++;

    if (reservedPort > config.gamePortRange.last)
    {
      cb(`There are no free ports.`);
      return;
    }
  }

  reservedPorts.push(reservedPort);
  cb(null, reservedPort, config.ip);
};

module.exports.releasePort = function(port)
{
  reservedPorts.splice(reservedPorts.indexOf(port), 1);
};

module.exports.checkGameName = function(id, name, gameType, cb)
{
  try
  {
    validateNameFormat(name);
  }

  catch(err)
  {
    cb(err, null);
    return;
  }

  if (gameHub.isGameNameUsed(name, gameType) === true)
  {
    rw.writeToGeneralLog(`validateName() Error: This name is already used by a different game. Input was: ${name}`);
    cb(`The game name ${name} is already used by a different game. Please choose one that's free.`);
  }

  //send back the first cue of the assisted hosting so that the user
  //can start picking settings
  cb(null);
};

module.exports.validateMapfile = function(mapfile, gameType, cb)
{
  var path;
  switch(gameType)
  {
    case "dom4":
    path = config.dom4DataPath;
    break;

    case "dom5":
    path = config.dom5DataPath;
    break;

    default:
    cb("The game type is incorrect. Cannot determine the path to validate the map.", null);
    return;
  }

  if (fs.existsSync(`${path}/maps/${mapfile}`) === false)
  {
    cb("The map file could not be found.");
    return;
  }

  cb(null, fs.readdirSync(`${path}/maps`).find(function(map)
  {
    return mapfile.toLowerCase() === map.toLowerCase();
  }));
};

module.exports.validateMod = function(mod, gameType, cb)
{
  var path;

  switch(gameType)
  {
    case "dom4":
    path = config.dom4DataPath;
    break;

    case "dom5":
    path = config.dom5DataPath;
    break;

    default:
    cb("The game type is incorrect. Cannot determine the path to validate the mods.", null);
    return;
  }

  if (fs.existsSync(`${path}/mods/${mod}`) === false)
  {
    cb(`The mod file ${mod} could not be found.`);
    return;
  }

  cb(null);
};

module.exports.releaseAllPorts = function()
{
  reservedPorts = [];
};

function reservePort()
{
  var reservedPort = config.gamePortRange.first.toString();
  var usedPorts = gameHub.getUsedPorts().concat(reservedPorts);

  while(usedPorts.includes(reservedPort.toString()) === true)
  {
    reservedPort++;

    if (reservedPort > config.gamePortRange.last)
    {
      return null;
    }
  }

  return reservedPort;
}

function validateNameFormat(name)
{
	if (name == null)
	{
    rw.writeToGeneralLog(`validateName() Error: Game name is null. Input was: ${name}`);
    throw "Game name MUST be specified.";
  }

	if (name.length > 24)
	{
    rw.writeToGeneralLog(`validateName() Error: Game name ${name} is too long. Input was: ${name}`);
    throw `Game name ${name} is too long. It must be within 24 characters.`;
  }

	if (/[^0-9a-zA-Z_~]/.test(name) === true)
	{
    rw.writeToGeneralLog(`validateName() Error: Invalid characters. Input was: ${name}`);
    throw `The game name ${name} contains invalid characters. Only letters, numbers and underscores are allowed.`;
  }

  if (name === "dom4" || name === "dom5" || name === "coe4")
  {
    rw.writeToGeneralLog(`validateName() Error: Reserved keyword. Input was: ${name}`);
    throw "This is a reserved keyword, please choose a different one.";
  }
}
