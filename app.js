
require("./prototype_functions.js");
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const downloader = require("./file_downloader.js");
const hoster = require("./hoster.js");

//Interfaces for game operating and hosting
var gameInterface = require("./game_interface.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
var io = require('socket.io-client');
var socket = io.connect(`http://${config.masterIP}:${config.masterPort}/`,
{
  reconnection: true
});

//initialize the spawner
require("./process_spawn").init(socket);

/************************************
*   MASTER SERVER AUTHENTICATION    *
************************************/
//This is called by the master server once it receives the socket connection,
//to verify that this server is trusted by using the token.
socket.on("init", function(data, serverCb)
{
  rw.log("general", "Received the init event from master server. Sending authentication attempt.");
  serverCb({name: config.name, hostedGameNames: gameInterface.getGameNames(), capacity: config.capacity, token: config.token, ip: config.ip, ownerDiscordID: config.ownerDiscordID});
});

//Received when the master server validates the authentication,
//at which point we can launch games.
socket.on("validated", function(data, serverCb)
{
  rw.log("general", "Authentication attempt validated by master server.");
});


/******************************
*   DISCONNECTION HANDLING    *
******************************/
socket.on("disconnect", function(reason)
{
  rw.log("general", `Socket disconnected. Reason: ${reason}.`);

  //release all reserved ports in assisted hosting instances,
  //because if it's the master server that crashed, when it comes back up
  //the ports will be reserved for no instance
  hoster.releaseAllPorts();
  gameInterface.shutDownGames(function()
  {

  });

  if (reason === "io server disconnect")
  {
    //reconnect if the server dropped the connection
    socket.connect();
  }

  //if the reason is "io client disconnect", the socket will try to
  //reconnect automatically, since the reconnection flag in the socket
  //original connection is true
});

/****************************
*   RECONNECTION HANDLING   *
****************************/
socket.on("reconnect", function(attemptNumber)
{
  //no need to relaunch games here as the authentication process will kick in again
  //from the very beginning, on connection, when the master server sends the "init" event
  rw.log("general", `Reconnected successfully on attempt ${attemptNumber}.`);
});

socket.on("reconnect_attempt", function(attemptNumber)
{
  //rw.log("general", `Attempting to reconnect...`);

  if (attemptNumber > 5)
  {
    //rw.log("general", "Unable to reconnect after 5 tries; shutting down games for safety.");
  }
});

socket.on("reconnect_error", function(attemptNumber)
{
  //rw.log("general", `Reconnect attempt failed.`);
});

//fired when it can't reconnect within reconnectionAttempts
socket.on("reconnect_failed", function()
{
  //rw.log("general", `Could not reconnect to the master server after all the set reconnectionAttempts. Shutting games down.`);
  gameInterface.shutDownGames();
});

/*********************************
*   ASSISTED HOSTING FUNCTIONS   *
*********************************/
socket.on("reservePort", function(data, serverCb)
{
  rw.log("general", `Request to reserve port received from user id <${data.id}>.`);
  hoster.reservePort(serverCb);
});

socket.on("releasePort", function(data)
{
  rw.log("general", `Request to release port received.`);
  hoster.releasePort(data.port);
});

socket.on("checkGameName", function(data, serverCb)
{
  rw.log("general", `Request to check game name <${data.name}> from user id <${data.id}> received.`);
  hoster.checkGameName(data.id, data.name, data.gameType, serverCb);
});

socket.on("validateMap", function(data, serverCb)
{
  rw.log("general", `Request to validate mapfile <${data.mapfile}> received.`);
  hoster.validateMapfile(data.mapfile, data.gameType, serverCb);
});

socket.on("validateMod", function(data, serverCb)
{
  rw.log("general", `Request to validate mod <${data.mod}> received.`);
  hoster.validateMod(data.mod, data.gameType, serverCb);
});


/******************************************************
*           DOWNLOAD MAP AND MODS FUNCTIONS           *
* The Google Drive api will be used for this purpose  *
******************************************************/

socket.on("downloadMap", function(data, serverCb)
{
  if (typeof data.fileId !== "string")
  {
    serverCb(new Error("fileId must be specified."));
    return;
  }

  if (typeof data.gameType !== "string" || /^(DOM4)|(DOM5)/i.test(data.gameType) === false)
  {
    serverCb("The gameType must be either dom4 or dom5.");
    return;
  }

  rw.log("upload", `Request to download map zipfile ${data.fileId} received.`);
  downloader.downloadMap(data.fileId, data.gameType, serverCb);
});

socket.on("downloadMod", function(data, serverCb)
{
  if (typeof data.fileId !== "string")
  {
    serverCb(new Error("fileId must be specified."));
    return;
  }

  if (typeof data.gameType !== "string" || /^(DOM4)|(DOM5)/i.test(data.gameType) === false)
  {
    serverCb("The gameType must be either dom4 or dom5.");
    return;
  }

  rw.log("upload", `Request to download mod zipfile ${data.fileId} received.`);
  downloader.downloadMod(data.fileId, data.gameType, serverCb);
});


/******************************************************
*             UNIVERSAL GAME FUNCTIONS                *
* All games have these, even if they work differently *
******************************************************/

socket.on("create", function(data, serverCb)
{
  if (gameInterface.isPortInUse(data.port) === true)
  {
    serverCb("This port is already being used by another game, please restart the hosting.", null);
    return;
  }

  gameInterface.create(data.name, data.port, data.gameType, data.args, socket, serverCb);
});

socket.on("host", function(data, serverCb)
{
  if (gameInterface.gameExists(data.port) === false)
  {
    serverCb("The slave server has no data for this game.", null);
    return;
  }

  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  if (gameInterface.isGameRunning(data.port) === true)
  {
    serverCb(null, `The game is already up and running.`);
    return;
  }

  gameInterface.requestHosting(data.port, data.args, socket, serverCb);
});

socket.on("kill", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.killGame(data.port, serverCb);
});

socket.on("nuke", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.nukeGame(data.port, serverCb);
});

socket.on("deleteGameSavefiles", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.deleteGameSavefiles(data, serverCb);
});

socket.on("getLastHostedTime", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getLastHostedTime(data, serverCb);
});

socket.on("deleteGameData", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.deleteGameData(data.port, serverCb);
});


/******************************
*   GAME-SPECIFIC FUNCTIONS   *
* Only some games have these  *
******************************/
//Dom 4 & 5
socket.on("getModList", function(data, serverCb)
{
  if (data == null || typeof data.gameType !== "string")
  {
    serverCb("Game type must be a string.", null);
  }

  else gameInterface.getModList(data.gameType, serverCb)
});

//Dom 4 & 5
socket.on("getMapList", function(data, serverCb)
{
  if (data == null || typeof data.gameType !== "string")
  {
    serverCb("Game type must be a string.", null);
  }

  else gameInterface.getMapList(data.gameType, serverCb)
});

//Dom5
socket.on("getTurnFile", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getTurnFile(data, serverCb);
});

//Dom5
socket.on("getScoreDump", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getScoreDump(data, serverCb);
});

//Dom 4 & 5
socket.on("saveSettings", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.saveSettings(data, serverCb);
});

//Dom 4 & 5
socket.on("start", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.start(data, serverCb);
});

//Dom 4 & 5
socket.on("restart", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.restart(data, serverCb);
});

//Dom 4 & 5
socket.on("backupSavefiles", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.backupSavefiles(data, serverCb);
});

//Dom 4 & 5
socket.on("rollback", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.rollback(data, serverCb);
});

//Dom 4 & 5
socket.on("changeCurrentTimer", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.changeCurrentTimer(data, serverCb);
});

//Dom5, in dom4 the default timer is just the current timer
//that has to be reset each turn
socket.on("changeDefaultTimer", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.changeDefaultTimer(data, serverCb);
});

//Dom 4 & 5
socket.on("getStales", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getStales(data, serverCb);
});

//Dom 4 & 5
socket.on("getTurnInfo", function(data, serverCb)
{
  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getTurnInfo(data, serverCb);
});

//Dom 5
socket.on("getSubmittedPretenders", function(data, serverCb)
{
  var path = config.dom5DataPath + "savedgames/" + data.name;

  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.getSubmittedPretenders(data, serverCb);
});

//Dom 5
socket.on("removePretender", function(data, serverCb)
{
  var path = config.dom5DataPath + "savedgames/" + data.name + "/" + data.nationFile;

  if (gameInterface.matchName(data.port, data.name) === false)
  {
    serverCb("The game's name and port do not match.", null);
    return;
  }

  gameInterface.removePretender(data, function(err)
  {
    if (err)
    {
      rw.logError({data: data}, `removePretender Error:`, err);
      serverCb(err, null);
      return;
    }

    gameInterface.killGame(data.port, function(err)
    {
      if (err)
      {
        rw.logError({data: data}, `killGame Error:`, err);
        serverCb(err, null);
        return;
      }

      gameInterface.requestHosting(data.port, null, socket, serverCb);
    });
  });
});

//Dom5
socket.on("getDump", function(data, serverCb)
{
  gameInterface.getDump(data, serverCb);
});
