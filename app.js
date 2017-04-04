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
//************************************socket.io
var svrForSocketIO = require('http').Server(express);
svrForSocketIO.listen(8082);
var io = '';
//*********************************************
var token = "EAAFE5ZCAyP2oBAFee4EfoVGz6ZAIU7HLv0T2bIXKikhYXxiSwD4Ujb3oU6198g4H9P9qBuckY2AwOl6x9j1tWieaURx3RhyGjpt8FUxWBReWEZCu4iVMC9gvaWGZAmn320FdkFPKMicy910p2ln4WxQYEDIlF0ZBJAFnMQaZCTeQZDZD";
var pass = "my_password_here";

var privateKey  = fs.readFileSync('./www.freetech.com.ar.key', 'utf8');
var certificate = fs.readFileSync('./www_freetech_com_ar.crt', 'utf8');
var serverCrt = fs.readFileSync('./DigiCertCA.crt', 'utf8');

var credentials = {ca: serverCrt, cert: certificate, key: privateKey};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
// save user->message to mysql
var cnn = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'marcelop',
  database:'facebook'
});

cnn.connect(function(err) {
  if (err)
    console.log('Problemas de conexion con mysql');
});

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
/*app.get("/", function (req, res) {
  res.send('<!doctype html><html><head></head><body><h1>'+
             'Mi primer pagina</h1></body></html>');
});
app.post("/", function (req, res) {
  res.send('<!doctype html><html><head></head><body><h1>'+
             'Mi primer pagina</h1></body></html>');
});*/
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
          receivedMessage(messagingEvent, req, res);
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
function receivedMessage(event, request, response) {
  var senderID = event.sender.id;
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

  saveTextMessage(event);// GUARDO EN MYSQL EL MENSAJE QUE ENVIA EL CLIENTE DESDE FB
  if (isEcho) {
    console.log("Received echo for message %s and app %d with metadata %s",
      messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);
    sendTextMessage(senderID, "Quick reply tapped");
    return;
  }

  if (messageText) {
//*************************************************socket.io
    io = require('socket.io')(svrForSocketIO);
    io.on('connection', function (socket) {
      socket.emit('news', { message: messageText });
    });
//********************************************************
    switch (messageText) {
      case 'file':
        sendFileMessage(senderID);
        break;
      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}

function saveTextMessage(evt) {
  var message = evt.message;
  var fecha = new Date();
  fecha = fecha.getYear()+'-'+fecha.getMonth()+'-'+fecha.getDate();
  var row = {
    recipient_id: evt.recipient.id,
    fb_username: evt.sender.id,
    text_message: message.text,
    time_i: evt.timestamp,
    date_i: fecha
  };
  cnn.query('insert into active_calls set ?', row, function(err, result) {
    if (err){
      console.log(err);
      return;
    }
  });
  //----------------------------------------------------------------------------
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: '',
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };
  // SAVE MESSAGE TO MYSQL------------------------------------------------------
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

httpServer.listen(8080);
httpsServer.listen(8443);
