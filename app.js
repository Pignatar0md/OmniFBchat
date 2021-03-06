'use strict';

var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var request = require('request');
var path = require('path');
var fs = require('fs');
var express = require('express');
var mysql = require('mysql');
var app = express();
var agtIdsocketId = new Array();
var senderID = "";
//-----------------------------------------------------POSTGRE
const postgrePool = require('./lib/pgdb');
var token = "EAAFfj6S1khYBAPv2kbEbjGuCzgYMwMKGZAGD9BBJZC9NJktaIRpSwjqKLxEDGCjDGUSQjQzNKzxFKRLMHFmhg2ZBgKfKH7AAP8IuiVUJPYqZC223PRZChwpKayOdUIWgrXbkaToKAqkExZCATvT6pTSf0UP4mYRiw3RiRMX9k0swZDZD";
var pass = "my_password_here";

var privateKey  = fs.readFileSync('./www.freetech.com.ar.key', 'utf8');
var certificate = fs.readFileSync('./www_freetech_com_ar.crt', 'utf8');
var serverCrt = fs.readFileSync('./DigiCertCA.crt', 'utf8');

var credentials = {ca: serverCrt, cert: certificate, key: privateKey};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
//--------------------------------------------------------------------- save user->message to mysql
var mysqlCnn = mysql.createPool({
  connectionLimit : 10,
  queueLimit: 30,
  acquireTimeout: 1000000,
  host: 'localhost',
  user: 'root',
  password: '098098ZZZ',
  database:'facebook'
});

mysqlCnn.getConnection(function(err) {
  if (err)
    console.log('Problemas de conexion con mysql: '+err);
});

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

var svrForSocketIO = https.createServer(credentials, app);
var io = require('socket.io')(svrForSocketIO);
svrForSocketIO.listen(8082);

app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === pass) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Fallo la validacion. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

app.post('/webhook', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;
      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.option) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent, req, res, IOsocket);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });
    res.sendStatus(200);
  }
});
var IOsocket = "";
io.on('connection', function (socket) {
  console.log("cliente Socket.IO conectado");
  IOsocket = socket;
  socket.on('responseDialog', function(data) {
    var time = getFechaHora();
    var row = {
      text_message: data.message,
      agent_id: data.agent_id,
      fb_username: data.fbuser_id,
      call_id: data.call_id,
      time_i: time[1],
      date_i: time[0],
      send_flag: 'o',
      recipient_id: data.recipient_id
    };
    // inserto el mensaje enviado por el agente OmniLeads a usuario de Facebook
    mysqlCnn.query('insert into active_calls set ?', row, function(err, result) {
      if (err){
        console.log("ERROR AL ejecutar insert mysql: "+err);
        }
        return;
    });
    var randSendingTime = getRandomArbitrary(2000, 15000);
    console.log("Mensaje Cliente->Server enviado");
    setTimeout(function() {sendTextMessage(senderID, row.text_message, 0);}, randSendingTime);
  });
});

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function receivedMessage(event, request, response, socket) {
  senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;
  // Me conecto a POSTGRE database y consulto los agentes online
  var onlineAgents = [];
  var selectedAgent;
  var call_id;
  var mysqlArgs = [];
  postgrePool.query('SELECT id as agente_id from ominicontacto_app_agenteprofile where estado = 2',
  function (err, result) {
    if (err) {
      return console.log(err);
    }
    for(var i = 0; i < result.rows.length; i++) {
      onlineAgents[i] = result.rows[i].agente_id;
    }
    selectedAgent = onlineAgents[Math.floor(Math.random() * onlineAgents.length)];
    mysqlArgs = [recipientID, senderID, selectedAgent];

    // Verifico si call_id no existe
    mysqlCnn.query('select distinct call_id from active_calls where recipient_id like ? and fb_username like ? and agent_id like ?',
     mysqlArgs,
     function(err, result) {
      if (err){
        console.log("ERROR AL ejecutar select de call_id mysql: "+err);
        }
        if(result == "") {
          call_id = parseInt(getRandomArbitrary(1000, 1999999));
        } else {
          call_id = result[0].call_id;
        }
        event.callid = call_id;
        var DatosEnJson = { message: messageText, agentId: selectedAgent, call_id: call_id, recipient_id: recipientID };
        saveTextMessage(event, selectedAgent, socket, DatosEnJson);// GUARDO EN MYSQL EL MENSAJE QUE ENVIA EL CLIENTE DESDE FB
        console.log("Mensaje Server->Cliente enviado");
    });
  });
  //------------------------------------------------------------
  if (isEcho) {
    //console.log("Received echo for message %s and app %d with metadata %s",
      //messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);
    sendTextMessage(senderID, "Quick reply tapped", 1);
    return;
  }
  if (messageText) {
    switch (messageText) {
      case 'file':
        sendFileMessage(senderID);
        break;
      default:
        sendTextMessage(senderID, messageText, 1);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received", 1);
  }
}

function getFechaHora() {
  var fecha = new Date();
  var mes = fecha.getMonth();
  var dia = fecha.getDate();
  var hours = fecha.getHours();
  var mins = fecha.getMinutes();
  var secs = fecha.getSeconds();
  mes = mes + 1;
  if(hours < 10) {
    hours = '0' + hours;
  }
  if(mins < 10) {
    mins = '0' + mins;
  }
  if(secs < 10) {
    secs = '0' + secs;
  }
  if(mes < 10) {
    mes = '0'+mes;
  }
  if(dia < 10) {
    dia = '0'+dia;
  }
  var hora = hours+':'+mins+':'+secs;
  fecha = fecha.getFullYear()+'-'+mes+'-'+dia;
  var tiempo = [fecha, hora];
  return tiempo;
}

function saveTextMessage(evt, agent, socket, jsonData) {
  var callid = evt.callid;
  var message = evt.message;
  var time = getFechaHora();
  var row = {
    recipient_id: evt.recipient.id,
    fb_username: evt.sender.id,
    text_message: message.text,
    time_i: time[1],
    date_i: time[0],
    call_id: callid,
    send_flag: 'f',
    agent_id: agent
  };
  //inserto el mensaje que viene desde un usuario de facebook a un agente de OmniLeads
  mysqlCnn.query('insert into active_calls set ?', row, function(err, result) {
    if (err){
      console.log("ERROR AL ejecutar insert mysql: "+err);
      }
      socket.emit('news', jsonData);
      return;
  });
  //----------------------------------------------------------------------------
}

function sendTextMessage(recipientId, messageText, Bot) {
  if(Bot === 1) {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: 'Buen dia, pronto estara en contacto con un asesor',
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
    };
  } else {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: messageText,
        metadata: "DEVELOPER_DEFINED_METADATA"
      }
    };
  }
  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s",
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s",
        recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });
}

httpServer.listen(8081);
httpsServer.listen(8443);
