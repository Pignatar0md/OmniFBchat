var https = require('https');
var bodyParser = require('body-parser');
var fs = require('fs');
var express = require('express');
var app = express();
//var request = require('request');
//var url = require('url');
var mysql = require('mysql');

var mysqlCnn = mysql.createPool({
  connectionLimit : 10,
  queueLimit: 30,
  acquireTimeout: 1000000,
  host: 'localhost',
  user: 'root',
  password: '098098ZZZ',
  database:'facebook'
});

var privateKey  = fs.readFileSync('./www.freetech.com.ar.key', 'utf8');
var certificate = fs.readFileSync('./www_freetech_com_ar.crt', 'utf8');
var serverCrt = fs.readFileSync('./DigiCertCA.crt', 'utf8');

var credentials = {ca: serverCrt, cert: certificate, key: privateKey};
//app.use(express.static(__dirname + '/public'));
var httpsServer = https.createServer(credentials, app).listen(8444);
//---------------------------------------------------------------------------------------
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
});
//--------------------------------------------------------------------------------------
app.get('/getmessages', function(req, res) {
  var call_id = req.query.callid;
  call_id = [call_id];
    mysqlCnn.query('select fb_username, text_message, call_id, recipient_id,send_flag from active_calls where call_id = ? order by date_i, time_i',
      call_id, function(err, result) {
      if (err){
        console.log("ERROR AL ejecutar insert mysql: "+err);
      }
      if(result.length > 0) {
        var jsonString = '{"dialog":[';
        for(var i = 0; i < result.length; i++) {
          jsonString += '{"fb_username":"'+result[i].fb_username+'",';
          jsonString += '"text_message":"'+result[i].text_message+'",';
          jsonString += '"recipient_id":"'+result[i].recipient_id+'",';
	        jsonString += '"call_id":"'+result[i].call_id+'",';
          jsonString += '"send_flag":"'+result[i].send_flag+'"},';
        }
	      jsonString = jsonString.substring(0,jsonString.length-1);
        jsonString = jsonString + ']}';
	      res.send(jsonString);
      }
    });
});

app.get('/movemessages', function(req, res) {
  var call_id = req.query.callid;
  call_id = [call_id];
  mysqlCnn.query('select recipient_id, fb_username, text_message, agent_id, send_flag, time_i, date_i, call_id from active_calls where call_id = ?',
  call_id, function(err, result) {
    if (err){
      console.log("ERROR AL ejecutar insert mysql: "+err);
    }
    if(result.length > 0) {
      for(var i = 0; i < result.length; i++) {
        var row = {
          recipient_id: result[i].recipient_id,
          fb_username: result[i].fb_username,
          text_message: result[i].text_message,
          agent_id: result[i].agent_id,
          send_flag: result[i].send_flag,
          time_i: result[i].time_i,
          date_i: result[i].date_i,
          call_id: result[i].call_id
        };
        mysqlCnn.query('insert into log_messages set ?', row, function(err, result) {
          if (err){
            console.log("ERROR AL ejecutar insert a log_calls mysql: "+err);
            }
            return;
        });
      }
    }
  });
});
/*var httpsServer = https.createServer(credentials, function(request, response) {
  var objurl = url.parse(request.url);
  var path = 'public'+objurl.pathname;
  if(path == 'public/') {
    path = path+'index.html';
  } else if(path == 'public/getmessages'){
    var call_id = url.parse(request.url,true).query.callid;
    call_id = [call_id];
    mysqlCnn.query('select fb_username, text_message, call_id, recipient_id,send_flag from active_calls where call_id = ? order by date_i, time_i',
      call_id, function(err, result) {
      if (err){
        console.log("ERROR AL ejecutar insert mysql: "+err);
      }
      if(result.length > 0) {
	var jsonString = '{"dialog":[';
	for(var i = 0; i < result.length; i++) {
	    jsonString += '{"fb_username":"'+result[i].fb_username+'",';
	    jsonString += '"text_message":"'+result[i].text_message+'",';
            jsonString += '"recipient_id":"'+result[i].recipient_id+'",';
            jsonString += '"send_flag":"'+result[i].send_flag+'"},';
        }
	jsonString = jsonString + ']}';
	response.writeHead(200, {'content-type':'text/json'});
        response.write(jsonString);
	response.end();
      }
    });
  }
}).listen(8444);*/
