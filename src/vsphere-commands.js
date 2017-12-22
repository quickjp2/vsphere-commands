// Description
//   A hubot script that allows users to interact with the vsphere-rest-api developed by quickjp2 on github.
//
// Dependencies:
//    NONE
//
// Configuration:
//    NONE
//
// Commands:
//    hubot list all vms - Lists out all vms
//    hubot show vm <uuid> - Shows description of the vm specified
//    hubot delete vm <uuid> - Deletes the vm specified
//    hubot create me vm - Opens up a dialogue with you to create a new vm
//    hubot change vm <uuid> - Opens up a dialogue with you to modify the specified vm
//
// Notes:
//    Requires a file named "v-config.json". See the example for what to include.
//
// Author:
//   quickjp2
(function() {
  var authToken, data, fs, http;

  fs = require('fs');
  http = require('http');
  data = process.env.VSPHERE_API_URL;

  try {
    fs.readFile('./v-config.json', function(err, contents) {
      if (err) {
        return console.log("Encountered an error: " + err);
      } else {
        data = {};
        data = JSON.parse(contents.toString());
        console.log("Upload successful; data is now..." + data)
        return data;
      }
    });
  } catch (error1) {
    return console.log("Hopefully the url has been set in the environment...");
  }
  var responses = ["sweet", "cool", "awesome", "fair enough", " sounds good", "ok",
    "fantastic", "roger that", "got it", "perfect"
  ];
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  authToken = "";

  var PacketBuilder = function(robot, msg, questions, url) {
    this.robot = robot;
    this.msg = msg;
    this.user = this.msg.message.user;
    this.room = this.msg.message.room;
    this.url = url;
    this.questions = questions;
    this.responders = {};
    this.salutations = ["sweet", "cool", "awesome", "fair enough", " sounds good", "ok",
      "fantastic", "roger that", "got it", "perfect"
    ];
    this.responses = [];
    for (var i = 0; i < this.questions.length; i++) {
      this.robot.logger.info("We're at index " + i);
      var single = this.questions[i];
      var response = {
        'key': '',
        'question': '',
        'answer': ''
      };
      response.key = single.dataname;
      response.question = single.question;
      this.responses.push(response);
    }
    this.robot.logger.info(this.url);
  };
  // Clean up the used responders
  PacketBuilder.prototype.cleanUp = function(_this) {
    _this = _this || this;
    for (var i = _this.questions.length - 1; i >= 0; i--) {
      _this.robot.logger.info("Index of responders is: " + i);
      var index = _this.responders[_this.questions[i].regex];
      _this.robot.listeners.splice(index, 1, function() {});
      delete _this.robot.listeners[index];
      //delete _this.responders[_this.questions[i].regex];
    }
  };

  // Spin up the next question
  PacketBuilder.prototype.askQuestion = function(num, _this) {
    // If the num is equal to the length, time to send the packet!
    _this = _this || this;
    if (num >= _this.questions.length) {
      _this.sendPacket(_this);
    } else {
      _this.robot.send({
        room: _this.user.name
      }, "" + _this.responses[num].question);
      _this.robot.logger.info('registering ' + _this.questions[num].regex +
        ' for the callback to question' + num);
      _this.robot.respond(_this.questions[num].regex, function(msg) {
        _this.robot.logger.info("response captured: " + msg);
        _this.responses[num].answer = msg.match[2];
        _this.robot.send({
            room: _this.user.name
          },
          _this.salutations[Math.floor(Math.random() * responses.length)]);
        _this.askQuestion(num + 1, _this);
      });
      var index = _this.robot.listeners.length - 1;
      _this.responders[_this.questions[num].regex] = index;
    }
  };

  PacketBuilder.prototype.sendPacket = function(_this) {
    _this = _this || this;
    _this.robot.logger.info(_this.user.name);
    payload = {
      datastore: "scaleio_vmw",
      vm_version: "vmx-10",
      user: "" + _this.user.name
    };
    _this.robot.logger.info(_this.responses.length);
    for (var i = 0; i < _this.responses.length; i++) {
      var key = _this.responses[i].key;
      if (key == 'guestid'){
        if (_this.responses[i]['answer'] == "ubuntu"){
          payload[key] = "ubuntu64Guest";
        } else if (_this.responses[i]['answer'] == "centos"){
          payload[key] = "centos64Guest";
        } else {
          payload[key] = "ubuntu64Guest";
        }
      } else if (key == 'language' || key == 'application'){
        if (_this.responses[i]['answer'] == "NA"){
          continue;
        } else {
          payload[key] = _this.responses[i]['answer'];
        }
      } else {
        payload[key] = _this.responses[i]['answer'];
      }
      _this.robot.logger.info(_this.responses[i].key + " is " +_this.responses[i]['answer']);
    }

    _this.robot.logger.info("Sending info to slack");
    _this.robot.send({
        room: _this.user.name
      }, "Making a " + payload.guestid +
      " vm named " + payload.name +
      " with " + payload.mem +
      " megabytes of memory and " + payload.cpus + " CPUs");
    _this.robot.logger.info("Sending packet to " + _this.url);
    _this.robot.http(_this.url).header('Content-Type', 'application/json').post(JSON.stringify(payload))(function(err, res, body) {
      if (err) {
        _this.robot.logger.info("Encountered an error: " + err);
        _this.robot.send({
          room: _this.msg.envelope.user.name
        }, "Encountered an error: " + err);
      } else {
        _this.robot.send({
          room: _this.user.name
        }, "" + body);
        _this.robot.send({
          room: _this.room
        }, "I have created a vm with this payload " + (JSON.stringify(payload, null, 2)));
      }
    });
    _this.cleanUp(_this);
  };

  module.exports = function(robot) {
    robot.respond(/list [me\s]*all vms/i, function(msg) {
      var url = data.url + "vms/"
      robot.logger.debug("Data is " + data)
      robot.logger.debug("URL is " + url)
      return robot.http(url).get()(function(err, res, body) {
        var all_vms, i, j, len, vm, vms;
        if (err) {
          robot.logger.info("API call encountered an error: " + err);
        } else {
          msg.send("We got vms..and there's a lot...let me filter this for you...please wait");
          vms = JSON.parse(body).vm;
          i = 0;
          all_vms = {
            "1": "Name: " + vms[i].name + " UUID: " + vms[i].instanceUuid + " OS: " + vms[i].guestFullName
          };
          i = 1;
          for (j = 0, len = vms.length; j < len; j++) {
            vm = vms[j];
            all_vms[i + 1] = "Name: " + vm.name + " UUID: " + vm.instanceUuid + " OS: " + vm.guestFullName;
            i = i + 1;
          }
          robot.logger.info(all_vms);
          return msg.send("" + (JSON.stringify(all_vms, null, 2)));
        }
      });
    });
    robot.respond(/(show vm) (.*)/i, function(msg) {
      var uuid;
      uuid = msg.match[2];
      msg.send("Searching for vm with uuid of " + uuid);
      return robot.http(data.url + ("vms/" + uuid + "/")).get()(function(err, res, body) {
        if (err) {
          robot.logger.info("Encountered an error: " + err);
        } else {
          return msg.send("" + body);
        }
      });
    });
    robot.respond(/(delete vm) (.*)/i, function(msg) {
      var uuid;
      uuid = msg.match[2];
      msg.send("Deleting vm with uuid of " + uuid);
      return robot.http(data.url + ("vms/" + uuid + "/"))["delete"]()(function(err, res, body) {
        if (err) {
          robot.logger.info("Encountered an error: " + err);
        } else {
          return msg.send("" + body);
        }
      });
    });
    robot.respond(/create me [a\s]*vm/i, function(msg) {
      robot.send({
        room: msg.envelope.user.name
      }, "Lets do it!");
      var questions = [{
        'question': 'How much memory in megabytes?(Format: mem <num>)',
        'dataname': 'mem',
        'regex': /(memory\s|mem\s)(\d{3,4})(.*)?/i
      }, {
        'question': 'Now how many cpus? (Format: cpus <num>)',
        'dataname': 'cpus',
        'regex': /(cpus\s)(\d)(.*)?/i
      }, {
        'question': 'What would you like to call it? (Please no spaces; format: name <name>)',
        'dataname': 'name',
        'regex': /(name\s)([\w-]+)(.*)/i
      }, {
        'question': 'What coding language will you use (if any)? (Format: language <language> or language NA)',
        'dataname': 'language',
        'regex': /(language\s)([\w-]+)(.*)/i
      },{
        'question': 'What application framework will you use (if any)? (Format: application <application> or application NA)',
        'dataname': 'application',
        'regex': /(application\s)([\w-]+)(.*)/i
      },{
        'question': 'One more thing...what is the os? We can provision Ubuntu or CentOS! Please type one of the following: os ubuntu, os centos',
        'dataname': 'guestid',
        'regex': /(os\s)([a-z,-]+)(.*)/i
      }];
      var tmpURL = data.url + "vms/";
      var createVMPacket = new PacketBuilder(robot, msg, questions, tmpURL);
      createVMPacket.askQuestion(0);
    });

    robot.respond(/(change vm) (.*)/i, function(msg) {
      var payload, uuid;
      robot.send({
        room: msg.envelope.user.name
      }, "That's a perfectly good vm...but ok! Let's do it!");
      uuid = msg.match[2];
      payload = {};
      robot.send({
        room: msg.envelope.user.name
      }, "Here's the uuid of the vm you want to change: " + uuid);
      robot.send({
        room: msg.envelope.user.name
      }, "Either specify the amount of cpus or type no cpu to skip. (ie. 2 cpu or no cpu)");
      robot.respond(/(.*) (cpu)/i, function(q1) {
        var cpus;
        cpus = q1.match[1];
        if (cpus !== "no") {
          cpus = parseInt(cpus, 10);
          robot.logger.info("Sending to the parser");
          payloa.cpu = "" + cpus;
        }
        robot.send({
          room: msg.envelope.user.name
        }, "Either specify the new amount of megabytes or tpye no mem to skip. (ie. 1024 mem or no mem)");
        robot.respond(/(.*) (mem)/i, function(q2) {
          var mem;
          mem = q2.match[1];
          if (mem !== "no") {
            mem = parseInt(mem, 10);
            payload.mem = "" + mem;
          }
          robot.logger.info("Sending packet");
          return robot.http(data.url + ("vms/" + uuid + "/")).header('Content-Type', 'application/json').put(JSON.stringify(payload))(function(err, res, body) {
            if (err) {
              robot.logger.info("Encountered an error: " + err);
              robot.send({
                room: msg.envelope.user.name
              }, "Encountered an error: " + err);
            } else {
              robot.send({
                room: msg.envelope.user.name
              }, "" + body);
              return msg.send("I have modified the vm (uuid: " + uuid + ") to have these specs: " + payload);
            }
          });
        });
      });
    });
  };

}).call(this);
