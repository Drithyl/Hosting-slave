
const fs = require("fs");
const hoster = require("./hoster.js");
const config = require("./config.json");
const rw = require("./reader_writer.js");

module.exports.convert = function(data, serverCb)
{
  console.log(`Data received: ${data}`);

  //grab the json data
  if (fs.existsSync(`C:/Users/Administrator/Desktop/Bots/MrClockwork/games/${data.name}/data.json`) === false)
  {
    console.log(`Game data does not exist.`);
    serverCb("The requested game does not exist.");
    return;
  }

  hoster.reservePort(function(err, port, ip)
  {
    if (err)
    {
      console.log(`Error reserving port: ${err}`);
      serverCb(`Could not reserve a port for the converted game.`);
      return;
    }

    let gameData = require(`C:/Users/Administrator/Desktop/Bots/MrClockwork/games/${data.name}/data.json`);
    let newData = Object.assign({}, gameData);
    console.log(`gameData read:`);
    console.log(gameData);

    newData.settings = {};
    newData.settings.map = newData.mapfile; delete newData.mapfile;
    newData.settings.mods = newData.mods; delete newData.mods;
    newData.settings.era = newData.era; delete newData.era;
    newData.settings.research = newData.research; delete newData.research;
    newData.settings.startingResearch = (newData.startingresearch === "random") ? 0 : 1;  delete newData.startingresearch;
    newData.settings.hallOfFame = newData.hofsize;  delete newData.hofsize;
    newData.settings.indieStrength = newData.indepstr; delete newData.indepstr;
    newData.settings.magicSites = newData.magicsites; delete newData.magicsites;
    newData.settings.level1Thrones = newData.thrones.lvl1;
    newData.settings.level2Thrones = newData.thrones.lvl2;
    newData.settings.level3Thrones = newData.thrones.lvl3;
    newData.settings.ap = newData.thrones.ap; delete newData.thrones;
    newData.settings.cataclysm = newData.cataclysm; delete newData.cataclysm;
    newData.settings.eventRarity = newData.eventrarity; delete newData.eventrarity;
    newData.settings.storyEvents = (newData.storyevents === "minor") ? 1 : (newData.storyevents === "full") ? 2 : 0; delete newData.storyevents;
    newData.settings.globalSlots = newData.globalslots; delete newData.globalslots;
    newData.settings.scoregraphs = (newData.scoregraphs === "on") ? 2 : (newData.scoregraphs === "off") ? 1 : 0; delete newData.scoregraphs;
    newData.settings.disciples = (newData.teamgame === "on") ? 1 : (newData.teamgame === "off") ? 0 : 2; delete newData.teamgame;
    newData.settings.masterPassword = newData.masterpassword; delete newData.masterpassword;
    newData.settings.aiNations = newData.aiplayers; delete newData.aiplayers;
    newData.settings.defaultTimer = newData.defaulttimer; delete newData.defaulttimer;
    newData.settings.currentTimer = newData.currenttimer; delete newData.currenttimer;

    newData.server = null;
    newData.serverToken = "7f6175d2-7be8-468c-88e0-a0d26bb96040";
    newData.gameType = "dom5"; delete newData.game;
    newData.isOnline = false;
    newData.isServerOnline = false;
    newData.isConvertedToV3 = true;  //Will be used for re-claiming pretenders
    newData.players = {};
    newData.isBlitz = false;
    newData.instance = null;
    newData.ip = ip
    newData.port = port;
    delete newData.reminders;
    delete newData.emails;

    console.log(`Finished editing newData:`);
    console.log(newData);

    var path = "C:/Users/Administrator/Desktop/Bots/MrClockwork-v3-master/data/games";

    try
    {
      console.log(`Creating dir and file...`);
      fs.mkdirSync(`${path}/${newData.name}`);
      fs.writeFileSync(`${path}/${newData.name}/data.json`, JSON.stringify(newData, null, 2));
      console.log(`Created, getting back to master with port and ip...`);
      serverCb(null, port, ip);
    }

    catch(err)
    {
      console.log(`An error occurred:`);
      console.log(err);
      serverCb(`An error occurred when creating the directory and data file for the updated game.`);
    }
  });
};

module.exports.deleteV2Data = function(data, serverCb)
{
  console.log(`Attempting to delete old data for game ${data.name}...`);
  rw.deleteDirContents(`C:/Users/Administrator/Desktop/Bots/MrClockwork/games/${data.name}`, null, function(err)
  {
    if (err)
    {
      rw.log("error", `Error occurred while deleting v2 data for game ${data.name}: `, err);
      serverCb(`An error occurred when deleting the old data: ${err}`);
    }

    fs.rmdir(`C:/Users/Administrator/Desktop/Bots/MrClockwork/games/${data.name}`, function(err)
    {
      if (err)
      {
        rw.log("error", `Error occurred while deleting v2 remaining directory for game ${data.name}: `, err);
        serverCb(`An error occurred when deleting the old remaining directory: ${err}`);
      }

      serverCb();
      console.log(`Deleted successfully.`);
    });
  });
};
