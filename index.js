var express = require('express')  // Module xử lí chung
var mysql = require('mysql2')     // Module cho phép sử dụng cơ sở dữ liệu mySQL 
var mqtt = require('mqtt')        // Module cho phép sử dụng giao thức mqtt

var app = express()
var port = 6060 

app.use(express.static("public"))
app.set("views engine", "ejs")
app.set("views", "./views")

var server = require("http").Server(app)
var io = require('socket.io')(server)

app.get('/', function (req, res) {
    res.render('home.ejs')
})

server.listen(port, function () {
    console.log('Server listening on port ' + port)
})

//-------------------------------CONNECT MQTT, SUBCRIBE TOPIC------------------------------
var client = mqtt.connect('mqtt://broker.emqx.io');

client.on("connect", function () {//create a listener, waits for the connect event and calls a callback function
    console.log("MQTT CONNECTED " + client.connected);//The on_connect event sets a flag called connected to true.
});

client.subscribe("home/dht11");

//-------------------------------------------------CONNECT SQL---------------------------------------------
var con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    port: 3306,
    password: '1234',
    database: 'myDatabase'
});

//---------------------------------------------CREATE TABLE in MySQL-------------------------------------------------
con.connect(function (err) {
    if (err) throw err;
    console.log("MySQL CONNECTED");
    var sql = "CREATE TABLE IF NOT EXISTS sensors (ID int(10) not null primary key auto_increment, Time datetime not null, Temperature int(3) not null, Humidity int(3) not null, Lux int(3) not null )"
    con.query(sql, function (err) {
        if (err)
            throw err;
        console.log("Table CREATED");
    });
})

//---------------------------------------- MQTT -> SQL --------------------------------------------

var m_time
var m_date
var newTemp
var newHumi
var newLux

var humi_graph = [];
var temp_graph = [];
var date_graph = [];
var lux_graph = [];

var counter = 0;

client.on('message', function (topic, message, packet) {//create a listener for this event (subscribed topic)
    console.log("Topic: " + topic)
    console.log("Message: " + message)
    const objData = JSON.parse(message)// {"Tempertature" = XX; "Humidity" = XX}
    if (topic == "home/dht11") {
        counter++;
        newTemp = objData.Temperature;
        newHumi = objData.Humidity;
        newLux = objData.Lux;
    }

    if (counter == 1) {
        counter = 0

        console.log("Ready to Insert into Database")
        var n = new Date()
        var month = n.getMonth() + 1
        var Date_and_Time = n.getFullYear() + "-" + month + "-" + n.getDate() + " " + n.getHours() + ":" + n.getMinutes() + ":" + n.getSeconds();

        var sql = "INSERT INTO sensors (Time, Temperature, Humidity, Lux) VALUES ('" + Date_and_Time.toString() + "', '" + newTemp + "', '" + newHumi + "', '" + newLux + "')"
        con.query(sql, function (err, result) {
            if (err) throw err;
            console.log("Table INSERTED: "+ Date_and_Time + " " + newTemp + " " + newHumi +" "+ newLux)
        });

        var sql1 = "SELECT * FROM sensors ORDER BY ID DESC limit 1"
        con.query(sql1, function (err, result, fields) {
            if (err) throw err;
            console.log("FROM sensors ORDER BY ID DESC");
            result.forEach(function (value) {
                m_date = value.Time.toString().slice(4, 15);
                m_time = value.Time.toString().slice(16, 24);
                newTemp = value.Temperature
                newHumi = value.Humidity
                newLux = value.Lux
                
                console.log("Time:"+ m_time + "; " +"Temperature:"+ newTemp + "; " + "Humidity:"+ newHumi +"; " + "Lux:" + newLux);
                console.log("")
                io.sockets.emit('server-update-data', {time: m_time, date: m_date, temp: newTemp, humi: newHumi, lux: newLux })
            })
          
            if (humi_graph.length < 8) {
                humi_graph.push(newHumi);
            }
            else {
                for (i = 0; i < 7; i++) {
                    humi_graph[i] = humi_graph[i + 1];
                }
                humi_graph[7] = newHumi;
            }

            if (temp_graph.length < 8) {
                temp_graph.push(newTemp);
            }
            else {
                for (u = 0; u < 7; u++) {
                    temp_graph[u] = temp_graph[u + 1];
                }
                temp_graph[7] = newTemp;
            }

            if (date_graph.length < 8) {
                date_graph.push(m_time);
            }
            else {
                for (x = 0; x < 7; x++) {
                    date_graph[x] = date_graph[x + 1];
                }
                date_graph[7] = m_time;
            }

            if (lux_graph.length < 8) {
                lux_graph.push(newLux);
            }
            else {
                for (i = 0; i < 7; i++) {
                    lux_graph[i] = lux_graph[i + 1];
                }
                lux_graph[7] = newLux;
            }
            io.sockets.emit("server-update-graph", {date_graph, temp_graph, humi_graph, lux_graph});
        });
    }
})
//-------------------------------------------Socket-----------------------------------------------

io.on('connection', function (socket) { // tạo kết nối giữa client và server
    console.log(socket.id + " connected")
    socket.on('disconnect', function () {
        console.log(socket.id + " disconnected")
    })

    socket.on("ledChange", function (data) {  //server lắng nghe dữ liệu từ client
        if (data == "on") {
            console.log('Bật LED')
            client.publish("led", 'on');   
        }
        else {
            console.log('Tắt LED')
            client.publish("led", 'off');
        }
    })

    socket.on("volumeChange", function(data){
        client.publish("buzz", data)
        console.log("volume:"+ data)
    })

})
