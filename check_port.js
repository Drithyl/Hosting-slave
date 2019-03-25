
/*Based on rocky's answer on Stack Overflow:
https://stackoverflow.com/questions/29860354/in-nodejs-how-do-i-check-if-a-port-is-listening-or-in-use

and hexacyanide's answer on Stack Overflow:
https://stackoverflow.com/questions/19129570/how-can-i-check-if-port-is-busy-in-nodejs/35251815
*/

const rw = require("./reader_writer.js");
const net = require('net');

module.exports = function(port, cb)
{
  var cbWasCalled = false;
  var timeoutMs = 30000;

  var server = net.createServer(function(socket)
  {
    socket.write("Echo server\r\n");
    socket.pipe(socket);
  });

  server.listen(port, "127.0.0.1");

  server.on("error", function(err)
  {
    if (err.code === "EADDRINUSE")
    {
      if (cbWasCalled === false)
      {
        server.close();
        cb(true);
        cbWasCalled = true;
      }
    }

    else if (cbWasCalled === false)
    {
      server.close();
      cb(false);
      cbWasCalled = true;
    }
  });

  server.on("listening", function(err)
  {
    server.close();

    if (cbWasCalled === false)
    {
      cb(false);
      cbWasCalled = true;
    }
  });

  setTimeout(function()
  {
    if (cbWasCalled === false)
    {
      server.close();
      rw.log("error", `Server listening on port ${port} did not get an answer after ${timeoutMs}ms.`);
      cb(false);
      cbWasCalled = true;
    }
  });
};
