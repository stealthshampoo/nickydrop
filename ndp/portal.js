/*
 * Scripts for the portal that handles user input and login.
 */

// Events
$(".twitch-connect").click(function() {
	var min = $("#min-input").val();
	var img = encodeURIComponent($("#img-input").val().trim());
	var bot = $("#botcheck").is(":checked").toString();
	var key = $("#bot-key-input").val();
	var mult = $("#vip-input").val();
	var addr_valid = ($("#ext-ip").val().match(/\S/) != null).toString();

	var addr;

	if (addr_valid) {
		addr = $("#ext-ip").val().trim();
	} else {
		addr = "";
	}

	Twitch.login({
		redirect_uri: "http://stealthshampoo.com/visuals/board/",
		scope: ["channel_read"],
		state: ["fucktlou", min, bot, key, mult, addr_valid, addr, img]
	});
})

$("#botcheck").change(function() {
	if (this.checked) {
		$("#botinfo").show();
		$("#connect-buttons").insertAfter("#botinfo");
	} else {
		$("#botinfo").hide();
		$("#connect-buttons").insertBefore("#botinfo");
	}
});

function init() {
	$("#botinfo").hide();
	$("#connect-buttons").insertBefore("#botinfo");
	
	Twitch.init({ clientId: "w624pas0h6pbraxchookn5knpd4gvp" },
				function(error, status) {
					if (status.authenticated) {
						console.log("Authenticated.");
					}
				});
}						

$(document).ready(init);
