/*
 * The main NickyDrop board. Hosted on http://stealthshampoo.com/visuals/board/
 * Users are redirected here from the portal with login credentials in 
 * the URL fragment.
 */

var SLOT_ROW = 9;
var INC_TIME = 200;
var ROLL_TIME = 250;
var ANGLE_INC = 100;

var L1 = 0;
var L2 = 1;
var M5 = 2;
var R2 = 3;
var R1 = 4;

var angle = 0;

var rows = [164, 200, 236, 270, 307, 344, 380, 415, 451, 515];
var even_cols = [16, 68, 140, 212, 284, 335];
var odd_cols = [32, 104, 176, 247, 320];
var slot_cols = [38, 105, 180, 251, 314];

var slot_chances = [L1, L2, M5, R2, R1];

// Twitch PubSub WebSocket state values
var ws = null;
var connected = false;
var pong_received = false;
var retry_time = 0;

// DeepBot WebSocket state values
var bot_ws = null;
var bot_connected = false;

// User options from the input form
var min_amount = 0;
var bot_id = "";
var bot_active = false;
var user_addr = "";
var vip_multiplier = 1;

// Queue of bit sends to run a game for
var queue = new Array(0);

// Queue for adding DeepBot points
var bot_points_queue = new Array(0);

function BitEntry(username, amount) {
	this.username = username;
	this.amount = amount;
}

function UserBotEntry(bitentry, slot) {
	this.entry = bitentry;
	this.slot = slot;
}

// Basic game logic/helper functions
function randint(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function select_slot() {
	var index = randint(0, slot_chances.length - 1);
	return slot_chances[index];
}

function set_chip_image(img, bit_amount) {
	if (bit_amount < 100)
		img.attr("src", "images/Gray_Chip.png");
	else if (bit_amount >= 100 && bit_amount < 1000)
		img.attr("src", "images/Purple_Chip.png");
	else if (bit_amount >= 1000 && bit_amount < 5000)
		img.attr("src", "images/Green_Chip.png");
	else if (bit_amount >= 5000 && bit_amount < 10000)
		img.attr("src", "images/Blue_Chip.png");
	else if (bit_amount >= 10000)
		img.attr("src", "images/Yellow_Chip.png");
}

function set_username(username) {
	document.getElementById("title-name").innerHTML = username;
}

// Recursively creates a path for the chip to take based off a
// winning slot.
function find_path(row, col, path) {
	if (row == 0)
		return;

	var next_col;
	if (row % 2 != 0) {
		next_col = randint(col, col + 1);
	} else {
		if (col == 0)
			next_col = 0;
		else if (col == 5)
			next_col = 4;
		else
			next_col = randint(col - 1, col);
	}

	path[row - 1] = next_col;
	find_path(row - 1, next_col, path);
}

function is_edge(col) {
	var left_edge = col == even_cols[0];
	var right_edge = col == even_cols[even_cols.length - 1];
	return left_edge || right_edge;
}

// Animations
function rotate_right(angle, pos) {
	return angle + (pos * ANGLE_INC);
}

function rotate_left(angle, pos) {
	return angle - (pos * ANGLE_INC);
}

function add_drop(chip, row, col) {
	chip.animate(
		{
			top: row + "px",
			left: col + "px",
		},
		{
			queue: true,
			easing: jQuery.easing.easeinQuad,
			duration: INC_TIME
		});
}

function add_roll(chip, current_row, current_col, next_col) {
	if (next_col > current_col) {
		chip.animate(
			{
				top: current_row + 10 + "px",
				left: current_col + 14 + "px"
			},
			{
				step: function(now,fx) {
					chip.css("-webkit-transform","rotate("+rotate_right(angle, fx.pos)+"deg)");
				},

				complete: function() {
					angle = angle + ANGLE_INC;
				},
				
				queue: true,
				easing: jQuery.easing.easeinCubic,
				duration: ROLL_TIME
			});

	} else {
		chip.animate(
			{
				top: current_row + 10 + "px",
				left: current_col - 14 + "px",
			},
			{
				step: function(now,fx) {
					chip.css("-webkit-transform", "rotate("+rotate_left(angle, fx.pos)+"deg)");
				},
				complete: function() {
					angle = angle - ANGLE_INC;
				},

				queue: true,
				easing: jQuery.easing.easeinCubic,
				duration: ROLL_TIME
			});
	}
}

// Main game functions
function add_audio(delay) {
	var audio = new Audio("audio/Bit " + randint(0,9) + ".mp3");
	setTimeout(function() { audio.play(); }, delay);
}

function animate_path(chip, path, slot) {
	var chip_top = parseInt(chip.css("top"), 10);
	var chip_left = parseInt(chip.css("left"), 10);

	var slide_time = 500 + INC_TIME * (5 - path[0]);
	chip.animate({ left: even_cols[path[0]] + "px" },
				 { queue: true, easing: "swing", duration: slide_time });
	add_drop(chip, rows[0], even_cols[path[0]]);

	add_audio(INC_TIME + slide_time);

	for (var i = 1; i < 9; i++) {
		add_audio(((i + 1) * INC_TIME) + ((i) * ROLL_TIME) + slide_time);
		
		if (i % 2 == 0) {
			add_roll(chip, rows[i-1], odd_cols[path[i-1]], even_cols[path[i]]);
			add_drop(chip, rows[i], even_cols[path[i]]);
		} else {
			add_roll(chip, rows[i-1], even_cols[path[i-1]], odd_cols[path[i]]);
			add_drop(chip, rows[i], odd_cols[path[i]]);
		}
	}

	add_audio(10 * INC_TIME + 9 * ROLL_TIME + slide_time);
	add_roll(chip, rows[8], even_cols[path[8]], slot_cols[slot]);
	add_drop(chip, rows[9], slot_cols[slot]);
}

function fade_in(board) {
	board.fadeTo(1000, 1);
}

function fade_out(board) {
	board.fadeTo(1000, 0);
}

function send_points(vip) {
	if (bot_points_queue.length == 0) return;
	
	var b = bot_points_queue[bot_points_queue.length - 1];
	
	var multiplier = 1;
	switch (b.slot) {
	case L1:
	case R1:
		multiplier = 1;
		break;
	case L2:
	case R2:
		multiplier = 2;
		break;
	case M5:
		multiplier = 5;
		break;
	default:
		break;
	}

	if (vip) multiplier = multiplier * vip_multiplier;

	var points = b.entry.amount * multiplier;
	bot_ws.send("api|add_points|" + b.entry.username + "|" + points.toString());
}

function cleanup(entry, board, chip, slot) {
	queue.pop();

	if (bot_connected) {
		var b = new UserBotEntry(entry, slot);
		bot_points_queue.unshift(b);
	}
	
	if (queue.length > 0) {
		add_drop(chip, rows[9] + 40, slot_cols[slot]);
		setTimeout(function() { run_game(true); }, INC_TIME + 1000);
	} else {
		fade_out(board);
	}
}

function bot_queue_handle() {
	if (bot_points_queue.length == 0) return;
	
	if (bot_connected) {
		var b = bot_points_queue[bot_points_queue.length - 1];
		bot_ws.send("api|get_user|" + b.entry.username);
	}
}

function run_game(hold) {
	var b = queue[queue.length - 1];
	bit_amount = b.amount;

	set_username(b.username);
	
	var chip = $("#chip");
	var board = $("#board");
	set_chip_image($("#chipimg"), bit_amount);

	var path = new Array(9);
	var slot = select_slot();
	find_path(9, slot, path);

	chip.css("top", "0px");
	chip.css("left", "414px");
	chip.show();

	if (!hold) {
		board.css("opacity", "0");
		fade_in(board);
	}

	setTimeout(function() { animate_path(chip, path, slot); }, 1500);
	setTimeout(function() { cleanup(b, board, chip, slot); }, 9000);
}

// Functions for Twitch PubSub for cheer
function get_id(callback) {
	Twitch.api({ method: "channel" }, function(error, channel) {
		callback(channel._id);
	});
}

function send_ping() {
	if (connected) {
		ws.send(JSON.stringify({ "type": "PING" }));
		pong_received = false;
		setTimeout(recv_pong, 10000);
	}
}

function recv_pong() {
	if (pong_received) {
		setTimeout(send_ping, 4 * 60 * 1000 + randint(100, 3000) - 10000);
	} else {
		ws.close();
	}
}

function incoming(event) {
	var data = JSON.parse(event.data);
	if (data.type == "MESSAGE") {
		var message = JSON.parse(data.data.message);
		var username = message.user_name;
		var bit_amount = message.bits_used;

		if (bit_amount < min_amount) return;

		var q = new BitEntry(username, bit_amount);

		if (queue.length == 0) {
			queue.unshift(q);
			run_game(false);
		} else {
			queue.unshift(q);
		}
	} else if (data.type == "PONG") {
		pong_received = true;
	} else if (data.type == "RECONNECT") {
		ws.close();
	}
}

function bit_sub() {
	connected = true;
	retry_time = 0;
	var token = Twitch.getToken();

	get_id(function(id) {
		ws.send(JSON.stringify(
			{
				"type": "LISTEN",
				"data": {
					"topics": ["channel-bitsevents." + id],
					"auth_token": token
				}
			}));

		setTimeout(send_ping, 4 * 60 * 1000 + randint(100, 3000));
	});
}

function reconnect() {
	connected = false;
	ws = null;
	setTimeout(open_pubsub, retry_time + 10000);
	retry_time = (retry_time * 1000 * 5 + randint(100, 3000) % (300 * 1000));
}

function open_pubsub() {
	try {
		ws = new WebSocket("wss://pubsub-edge.twitch.tv");
		ws.onopen = bit_sub;
		ws.onmessage = incoming;
		ws.onclose = reconnect;
	} catch (e) {
		console.log(e);
	}
}

// Bot WebSocket functions
function bot_incoming(event) {
    var data = JSON.parse(event.data);

    if (data.function == "register") {
		console.log(data);
		bot_connected = data.msg == "success";
		if (bot_connected) {
			console.log("Bot connected.");
		}
	} else if (data.function == "get_user") {
		console.log(data);
		var vip = data.msg.vip == 10;
		send_points(vip);
	} else if (data.function == "add_points") {
		console.log(data);
		if (data.msg == "success") {
			bot_points_queue.pop();
		}
	}
}

function bot_register() {
	bot_ws.send("api|register|" + bot_id);
}

function bot_reconnect() {
	console.log("Bot reconnecting...");
	bot_connected = false;
	bot_ws = null;
	setTimeout(open_bot, 10000);
}

function open_bot() {
	try {
		bot_ws = new WebSocket("ws://" + user_addr + ":3337");
		bot_ws.onopen = bot_register;
		bot_ws.onmessage = bot_incoming;
		bot_ws.onclose = bot_reconnect;
	} catch (e) {
		console.log(e);
	}
}

function setup_bot_ws() {
	$.getJSON("//api.ipify.org/?format=json").done(function(data) {
		user_addr = data.ip;
		open_bot();
	});
}

// Initialization
function verify_form() {
	var url = window.location.href.split("#")[1];
	var url_state;
	url.split("&").forEach(function (token) {
		var query = token.split("=");
		if (query[0] == "state") {
			url_state = query[1];
		}
	});

	var params = url_state.split("+");

	min_amount = parseInt(params[1]);
	bot_active = params[2] == "true";

	if (params[7] != "") {
		console.log(params[7]);
		$("#bg").attr("src", decodeURIComponent(params[7]).replace("%3A", ":").replace(/%2F/g, "/"));
	}

	if (bot_active) {
		bot_id = params[3];
		vip_multiplier = parseInt(params[4]);
		if (params[5] == "true") {
			user_addr = params[6];
			open_bot();
		} else {
			setup_bot_ws();
		}
	}

	setInterval(bot_queue_handle, 5000);
}

function init() {
	$("#chip").hide();
	$("#board").hide();

	Twitch.init({ clientId: "w624pas0h6pbraxchookn5knpd4gvp" },
				function(error, status) {
					if (status.authenticated) {
						console.log("Authenticated.");
						verify_form();
						open_pubsub();
					}
				});
}						

$(document).ready(init);
