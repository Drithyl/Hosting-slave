
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");

module.exports.getTurnInfo = function(gameName, cb)
{
  //either game has not started or something unexpectedly deleted the statuspage
  //file while the game is ongoing, for instance, a failed restart. The file might
  //not get regenerated in time when Dominions is running before a timer check
  //gets done so this would be an error
  if (fs.existsSync(`${config.statusPageBasePath}/${gameName}_status`) === false)
  {
    let err = new Error(`statuspage does not exist.`);
    err.code = "ENOENT";  //"Error No Entry", standard for when a path doesn't exist
    return cb(err);
  }

  fs.readFile(`${config.statusPageBasePath}/${gameName}_status`, "utf8", (err, content) =>
  {
    if (err)
    {
      rw.log("error", true, `Error occurred while reading file ${config.statusPageBasePath}/${gameName}_status:`, err);
      cb(new Error(`There was an Error reading the statuspage:\n\n${err.message}`));
    }

    else cb(null, parse(content));
  });
};

module.exports.getTurnInfoSync = function(gameName, cb)
{
  let statusInfo;

  //either game has not started or something unexpectedly deleted the statuspage
  //file while the game is ongoing, for instance, a failed restart. The file might
  //not get regenerated in time when Dominions is running before a timer check
  //gets done so this would be an error
  if (fs.existsSync(`${config.statusPageBasePath}/${gameName}_status`) === false)
  {
    return null;
  }

  try
  {
    statusInfo = fs.readFileSync(`${config.statusPageBasePath}/${gameName}_status`, "utf8")
  }

  catch(err)
  {
    rw.log("error", true, `Error occurred while reading file ${config.statusPageBasePath}/${gameName}_status:`, err);
    throw new Error(`There was an Error reading the statuspage:\n\n${err.message}`);
  }

  return parse(statusInfo);
};

function parse(data)
{
  var timer = createTimer();
  var daysRegex = new RegExp("\\d+\\s+days?", "i");
  var hoursRegex = new RegExp("\\d+\\s+hours?", "i");
  var minutesRegex = new RegExp("\\d+\\s+minutes?", "i");
  var secondsRegex = new RegExp("\\d+\\s+seconds?", "i");
  var statusInfo;
  var turn;
  var days;
  var hours;
  var minutes;
  var seconds;

  if (/\S+/.test(data) === false)
  {
    return timer;
  }

  statusInfo = data.match(/<td class="blackbolddata" colspan="2">.+\,(.+)<\/td>/)[0]
                   .replace(/<td class="blackbolddata" colspan="2">.+\,(.+)<\/td>/, "$1");


  ///statusInfo = data.slice(data.indexOf("turn"), data.indexOf("</td>", data.indexOf("turn")));
  turn = +statusInfo.match(/\d+/)[0];

  if (statusInfo.match(daysRegex) != null)
  {
    days = +statusInfo.match(daysRegex)[0].replace(/\D/g, "");
  }

  if (statusInfo.match(hoursRegex) != null)
  {
    hours = +statusInfo.match(hoursRegex)[0].replace(/\D/g, "");
  }

  if (statusInfo.match(minutesRegex) != null)
  {
    minutes = +statusInfo.match(minutesRegex)[0].replace(/\D/g, "");
  }

  if (statusInfo.match(secondsRegex) != null)
  {
    seconds = +statusInfo.match(secondsRegex)[0].replace(/\D/g, "");
  }

	if (isNaN(turn) === false)
  {
    timer.turn = turn;
  }

  if (isNaN(days) === false)
  {
    timer.days = days;
  }

  else timer.days = 0;

  if (isNaN(hours) === false)
  {
    timer.hours = hours;
  }

  else timer.hours = 0;

  if (isNaN(minutes) === false)
  {
    timer.minutes = minutes;
  }

  else timer.minutes = 0;

  if (isNaN(seconds) === false)
  {
    timer.seconds = seconds;
  }

  else timer.seconds = 0;

  //include the totalHours, totalMinutes and totalSeconds calculations for convenience
  timer.totalHours = getTotalHours(timer);
  timer.totalMinutes = getTotalMinutes(timer);
  timer.totalSeconds = module.exports.getTotalSeconds(timer);

  //total seconds
  if (timer.totalSeconds <= 0)
  {
    timer.isPaused = true;
  }

  else timer.isPaused = false;

	return timer;
}

function createTimer()
{
  var obj =
  {
    turn: null,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalHours: 0,
    totalMinutes: 0,
    totalSeconds: 0,
    isPaused: true
  }

  obj.toExeArguments = function()
  {
    if (this.isPaused === true)
    {
      return [""];
    }

    if (obj.totalHours <= 0 && obj.totalMinutes <= 0 && obj.totalSeconds > 0)
    {
      return ["--minutes", "1"];
    }

    else if (obj.totalHours <= 0 && obj.totalMinutes > 0)
    {
      return ["--minutes", obj.totalMinutes.toString()];
    }

    else if (obj.totalHours > 0)
    {
      return ["--hours", (obj.totalHours + 1).toString()];
    }

    else
    {
      rw.log(null, "This timer probably has 0 hours, minutes and seconds, but is also not paused. Something's wrong: ");
      rw.log(null, this);
      return [""];
    }
  }

  return obj;
}

module.exports.getTotalSeconds = function(timer)
{
  let seconds = 0;

  //assume it already comes in seconds if it is a number that's passed, so return the value
  if (isNaN(timer) === false)
  {
    return timer;
  }

  //timer comes in an array of exe arguments
  if (Array.isArray(timer) === true)
  {
    let hours;
    let minutes;

    timer.find(function(arg, index, array)
    {
      if (typeof arg === "string" && /--hours/i.test(arg) === true)
      {
        //grab next index, since the number of hours comes in a separate index
        hours = +array[index+1].replace(/\D+/g, "");
      }
    });

    timer.find(function(arg)
    {
      if (typeof arg === "string" && /--minutes/i.test(arg) === true)
      {
        minutes = +array[index+1].replace(/\D+/g, "");
      }
    });

    if (isNaN(hours) === false)
    {
      seconds += hours * 3600;
    }

    if (isNaN(minutes) === false)
    {
      seconds += minutes * 60;
    }

    return seconds;
  }

  //if the timer is passed as an object, convert it to seconds
  if (typeof timer === "object")
  {
    if (isNaN(timer.days) === false)
    {
      seconds += timer.days * 3600 * 24;
    }

    if (isNaN(timer.hours) === false)
    {
      seconds += timer.hours * 3600;
    }

    if (isNaN(timer.minutes) === false)
    {
      seconds += timer.minutes * 60;
    }

    if (isNaN(timer.seconds) === false)
    {
      seconds += timer.seconds;
    }

    return seconds;
  }

  return null;
};

function getTotalMinutes(timer)
{
  return (timer.days * 24 * 60) + (timer.hours * 60) + timer.minutes;
}

function getTotalHours(timer)
{
  return timer.days * 24 + timer.hours;
}
