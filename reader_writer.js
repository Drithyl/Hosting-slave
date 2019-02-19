const fs = require("fs");
const config = require("./config.json");

module.exports.copyFile = function(source, target, cb)
{
	module.exports.checkAndCreateDir(target);

	fs.readFile(source, function(err, buffer)
	{
		if (err)
		{
			module.exports.logError({source: source, target: target}, `fs.readFile Error`, err);
			cb(err);
			return;
		}

		fs.writeFile(target, buffer, function(err)
		{
			if (err)
			{
				module.exports.logError({source: source, target: target}, `fs.writeFile Error`, err);
				cb(err);
			}

			else cb(null);
		});
	});
};

module.exports.copyDir = function(source, target, deepCopy, extensionFilter, cb)
{
	let filenames;

	if (fs.existsSync(source) === false)
	{
		cb(`The source path ${source} does not exist.`);
		return;
	}


	filenames = fs.readdirSync(source);
	loop();

	function loop()
	{
		if (filenames.length < 1)
		{
			cb(null);
			return;
		}

		let file = filenames.shift();

		//if there's a directory inside our directory and no extension filter, copy its contents too
		if (deepCopy === true && fs.lstatSync(`${source}/${file}`).isDirectory() === true)
		{
			module.exports.copyDir(`${source}/${file}`, `${target}/${file}`, deepCopy, extensionFilter, function(err)
			{
				if (err)
				{
					module.exports.logError({source: source, target: target, deepCopy: deepCopy, extensionFilter: extensionFilter}, `copyDir Error:`, err);
					cb(err);
				}

				else loop();
			});
		}

		//run code if no extension filter was designated or if there was one and the file extension is included
		//or if there is an extension filter that includes empty extensions "" (files without extensions)
		else if (Array.isArray(extensionFilter) === false ||
						 (Array.isArray(extensionFilter) === true && extensionFilter.includes(file.slice(file.lastIndexOf(".")).toLowerCase()) === true) ||
						 (Array.isArray(extensionFilter) === true && extensionFilter.includes("") === true) && file.includes(".") === false)
		{
			module.exports.copyFile(`${source}/${file}`, `${target}/${file}`, function(err)
			{
				if (err)
				{
					cb(err);
				}

				else loop();
			});
		}

		//ignore file and loop
		else loop();
	}
};

module.exports.deleteDirContents = function(path, extensionFilter, cb)
{
	let filenames = fs.readdirSync(path);
	loop();

	function loop()
	{
		if (filenames.length < 1)
		{
			cb(null);
			return;
		}

		let file = filenames.shift();

		//if there's a directory inside our directory and no extension filter, delete its contents too
		if (fs.lstatSync(`${path}/${file}`).isDirectory() === true)
		{
			loop();
			return;
		}

		if (Array.isArray(extensionFilter) === true &&
				extensionFilter.includes(file.slice(file.lastIndexOf(".")).toLowerCase()) === false &&
				(extensionFilter.includes("") === false && file.includes(".") === false))
		{
			loop();
			return;
		}

		//run code if no extension filter was designated or if there was one and the file extension is included
		//or if there is an extension filter that includes empty extensions "" (files without extensions)
		fs.unlink(`${path}/${file}`, function(err)
		{
			if (err)
			{
				module.exports.logError({path: path, extensionFilter: extensionFilter}, `fs.unlink Error:`, err);
				cb(err);
			}

			else loop();
		});
	}
};

//If a directory does not exist, this will create it
module.exports.checkAndCreateDir = function(filepath)
{
	var splitPath = filepath.split("/");
	var compoundPath = splitPath.shift();

	//It's length >= 1 because we don't want the last element of the path, which will be a file, not a directory
	while (splitPath.length != null && splitPath.length >= 1)
	{
		//prevent empty paths from being created
		if (fs.existsSync(compoundPath) === false && /[\w]/.test(compoundPath) === true)
	  {
	    fs.mkdirSync(compoundPath);
	  }

		compoundPath += "/" + splitPath.shift();
	}
};

module.exports.readJSON = function(path, reviver, callback)
{
	var obj = {};

	fs.readFile(path, "utf8", (err, data) =>
 	{
		if (err)
		{
			module.exports.logError({path: path, reviver: reviver, callback: callback}, `fs.readFile Error:`, err);
			throw `There was an error while trying to read the JSON file ${path}:\n\n${err}`;
		}

		if (/[\w\d]/.test(data) === false)
		{
			module.exports.logError({path: path}, `File contains only whitespace`);
			throw `No data in ${path}.`;
		}

		if (reviver == null)
		{
			obj = JSON.parse(data);
		}

		else
		{
			obj = JSON.parse(data, reviver);
		}

		callback(obj);
	});
};

module.exports.saveJSON = function(filePath, obj, keysToFilter)
{
	fs.writeFile(filePath, objToJSON(obj), (err) =>
	{
		if (err)
		{
			module.exports.logError({filePath: filePath, obj: obj, keysToFilter: keysToFilter}, `fs.writeFile Error:`, err);
			return;
		}
	});
};

module.exports.getDirFilenames = function(path, extensionFilter, cb)
{
	var filenames = [];

	if (fs.existsSync(path) === false)
	{
		cb("This directory was not found on the server.", null);
	}

	fs.readdir(path, "utf8", (err, files) =>
	{
		if (err)
		{
			module.exports.logError({path: path, extensionFilter: extensionFilter}, `fs.readdir Error:`, err);
			cb(err, null);
			return;
		}

		for (var i = 0; i < files.length; i++)
		{
			if (extensionFilter == null)
			{
				filenames.push(files[i]);
			}

			else if (files[i].slice(files[i].lastIndexOf(".")).toLowerCase() === extensionFilter.toLowerCase())
			{
				filenames.push(files[i]);
			}
		}

		cb(null, filenames);
	});
};

module.exports.readDirContent = function(path, extensionFilter, cb)
{
	var data = {};

	if (fs.existsSync(path) === false)
	{
		cb("This directory was not found on the server.", null);
		return
	}

	fs.readdir(path, "utf8", function(err, files)
	{
		if (err)
		{
			module.exports.logError({path: path, extensionFilter: extensionFilter}, `fs.readdir Error:`, err);
			cb(err, null);
			return;
		}

		for (var i = 0; i < files.length; i++)
		{
			if (extensionFilter == null)
			{
				data[files[i]] = fs.readFileSync(path + "/" + files[i], "utf8");
			}

			else if (files[i].slice(files[i].lastIndexOf(".")).toLowerCase() === extensionFilter.toLowerCase())
			{
				data[files[i]] = fs.readFileSync(path + "/" + files[i], "utf8");
			}
		}

		cb(null, data);
	});
};

module.exports.writeToGeneralLog = function(...inputs)
{
	module.exports.log(config.generalLogPath, ...inputs);
};

module.exports.writeToUploadLog = function(...inputs)
{
	module.exports.log(config.uploadLogPath, ...inputs);
};

module.exports.log = function(path, ...inputs)
{
	var msg = module.exports.timestamp() + "\n";

	inputs.forEach(function(input)
	{
		if (typeof input === "string")
		{
			//add tab characters to each line so that they are all indented relative to the timestamp
			input.split("\n").forEach(function(line)
			{
				msg += `\t${line}\n`;
			});
		}

		else
		{
			msg += `\t${JSONStringify(input)}\n`;
		}
	});

	console.log(`${msg}\n`);

	fs.appendFile(path, `${msg}\r\n\n`, function (err)
	{
		if (err)
		{
			console.log(err);
			return;
		}
	});
};

module.exports.logError = function(values, ...inputs)
{
	var errMsg = `${module.exports.timestamp()}\n`;

	if (typeof values === "object")
	{
		errMsg += `Values: \n\t${JSONStringify(values)}\n\n`;
	}

	//assume first parameter is just more inputs instead of values to print
	else inputs.unshift(values);

	inputs.forEach(function(input)
	{
		if (typeof input === "string")
		{
			//add tab characters to each line so that they are all indented relative to the timestamp
			input.split("\n").forEach(function(line)
			{
				errMsg += `\t${line}\n`;
			});
		}

		else errMsg += `\t${JSONStringify(input)}\n`;
	});

	console.log(`${errMsg}\n`);
	console.trace();
	console.log("\n");

	[config.errorLogPath, config.generalLogPath].forEachAsync(function(path, index, next)
	{
		fs.appendFile(path, `${errMsg}\r\n\n`, function (err)
		{
			if (err)
			{
				console.log(err);
				next();
				return;
			}

			next();
		});

	});
};

module.exports.traceError = function(...inputs)
{
	var msg = module.exports.timestamp() + "\n";

	inputs.forEach(function(input)
	{
		if (typeof input === "string")
		{
			//add tab characters to each line so that they are all indented relative to the timestamp
			input.split("\n").forEach(function(line)
			{
				msg += `\t${line}\n`;
			});
		}

		else msg += `\t${JSONStringify(input)}\n`;
	});

	console.log(`${msg}\n`);
	console.trace();
	console.log("\n");

	fs.appendFile(config.errorLogPath, `${msg}\r\n\n`, function (err)
	{
		if (err)
		{
			console.log(err);
			return;
		}
	});
};

module.exports.timestamp = function()
{
	var now = new Date();
	var hours = now.getHours();
	var minutes = now.getMinutes();
	var seconds = now.getSeconds();
	var ms = now.getMilliseconds();

	if (hours < 10)
	{
		hours = `0${hours}`;
	}

	if (minutes < 10)
	{
		minutes = `0${minutes}`;
	}

	if (seconds < 10)
	{
		seconds = `0${seconds}`;
	}

	if (ms < 10)
	{
		ms = `00${ms}`;
	}

	else if (ms < 100)
	{
		ms = `0${ms}`;
	}

	return `${hours}:${minutes}:${seconds}:${ms}, ${now.toDateString()}`;
};

/*******************READING SAVED DATA**********************/
function objToJSON(obj, keysToFilter = {"instance": null, "guild": "id", "channel": "id", "role": "id", "organizer": "id"})
{
	var copyObj = Object.assign({}, obj);

	for (var key in keysToFilter)
	{
		if (copyObj[key] == null)
		{
			continue;
		}

		if (keysToFilter[key] == null)
		{
			delete copyObj[key];
			continue;
		}

		if (copyObj[key][keysToFilter[key]])
		{
			copyObj[key] = copyObj[key][keysToFilter[key]];
		}
	}

	return JSONStringify(copyObj);
}

//Stringify that prevents circular references taken from https://antony.fyi/pretty-printing-javascript-objects-as-json/
function JSONStringify(object, spacing = 2)
{
	var cache = [];

	//custom replacer function gets around the circular reference errors by discarding them
	var str = JSON.stringify(object, function(key, value)
	{
		if (typeof value === "object" && value != null)
		{
			//value already found before, discard it
			if (cache.indexOf(value) !== -1)
			{
				return;
			}

			//not found before, store this value for reference
			cache.push(value);
		}

		return value;

	}, spacing);

	//enable garbage collection
	cache = null;
	return str;
}
