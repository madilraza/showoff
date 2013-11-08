// presenter js
var slaveWindow = null;

var paceData = [];

$(document).ready(function(){
  // attempt to open another window for the presentation. This may fail if
  // popup blockers are enabled. In that case, the presenter needs to manually
  // open the window by hitting the 'slave window' button.
  openSlave();

  // the presenter window doesn't need the reload on resize bit
  $(window).unbind('resize');

  // side menu accordian crap
	$("#preso").bind("showoff:loaded", function (event) {
		$(".menu > ul ul").hide()
		$(".menu > ul a").click(function() {
			if ($(this).next().is('ul')) {
				$(this).next().toggle()
			} else {
				gotoSlide($(this).attr('rel'));
				try { slaveWindow.gotoSlide($(this).attr('rel'), false) } catch (e) {}
				postSlide();
				update();
			}
			return false;
		}).next().hide();
	});

  $("#minStop").hide();
  $("#startTimer").click(function() { toggleTimer() });
  $("#stopTimer").click(function() { toggleTimer() });

  /* zoom slide to match preview size, then set up resize handler. */
  zoom();
  $(window).resize(function() { zoom(); });

  // set up tooltips
  $('#report').tipsy({ offset: 5 });
  $('#slaveWindow').tipsy({ offset: 5 });
  $('#generatePDF').tipsy({ offset: 5 });
  $('#onePage').tipsy({ offset: 5, gravity: 'ne' });

  $('#stats').tipsy({ html: true, width: 450, trigger: 'manual', gravity: 'ne', opacity: 0.9, offset: 5 });
  $('#downloads').tipsy({ html: true, width: 425, trigger: 'manual', gravity: 'ne', opacity: 0.9, offset: 5 });

  $('#stats').click( function(e) {  popupLoader( $(this), '/stats', 'stats', e); });
  $('#downloads').click( function(e) {  popupLoader( $(this), '/download', 'downloads', e); });

  $('#enableFollower').tipsy({ gravity: 'ne' });
  $('#enableRemote').tipsy();
  $('#zoomer').tipsy({ gravity: 'ne' });

  // Bind events for mobile viewing
  $('#preso').unbind('tap').unbind('swipeleft').unbind('swiperight');

  $('#preso').addSwipeEvents().
    bind('tap', presNextStep).        // next
    bind('swipeleft', presNextStep).  // next
    bind('swiperight', presPrevStep); // prev

  // set up the presenter modes
  mode = { track: false, follow: true, update: true };

  $('#remoteToggle').change( toggleFollower );
  $('#followerToggle').change( toggleUpdater );

  $('#topbar #update').click( function(e) {
    e.preventDefault();
    $.get("/getpage", function(data) {
      gotoSlide(data);
    });
  });

  setInterval(function() { updatePace() }, 1000);

  // Tell the showoff server that we're a presenter
  register();
});

function popupLoader(elem, page, id, event)
{
  var title = elem.attr('title');
  event.preventDefault();

  if(elem.attr('open') == 'true') {
    elem.attr('open', false)
    elem.tipsy("hide");
  }
  else {
    $.get(page, function(data) {
      var link = '<p class="newpage"><a href="' + page + '" target="_new">Open in new page...</a>';
      var content = '<div id="' + id + '">' + $(data).find('#wrapper').html() + link + '</div>';

      console.log(content);

      elem.attr('title', content);
      elem.attr('open', true)
      elem.tipsy("show");
      setupStats();
    });
  }

  return false;
}

function reportIssue() {
  var slide  = $("span#slideFile").text();
  var issues = $("span#issueUrl").text();
  var link = issues + encodeURIComponent('Issue with slide: ' + slide);
  window.open(link);
}

function openSlave()
{
  try {
    if(slaveWindow == null || typeof(slaveWindow) == 'undefined' || slaveWindow.closed){
        slaveWindow = window.open('/' + window.location.hash);
    }
    else if(slaveWindow.location.hash != window.location.hash) {
      // maybe we need to reset content?
      slaveWindow.location.href = '/' + window.location.hash;
    }

    // maintain the pointer back to the parent.
    slaveWindow.presenterView = window;
    slaveWindow.mode = { track: false, slave: true, follow: false };
  }
  catch(e) {
    console.log('Failed to open or connect slave window. Popup blocker?');
    console.log(e);
  }

  // Set up a maintenance loop to keep the connection between windows. I wish there were a cleaner way to do this.
  if (typeof maintainSlave == 'undefined') {
    maintainSlave = setInterval(openSlave, 1000);
  }
}

function askQuestion(question) {
  $("#questions ul").prepend($('<li/>').text(question));
}

function paceFeedback(pace) {
  var now = new Date();
  switch(pace) {
    case 'fast': paceData.push({time: now, pace: -1}); break; // too fast
    case 'slow': paceData.push({time: now, pace:  1}); break; // too slow
  }

  updatePace();
}

function updatePace() {
  // pace notices expire in a few minutes
  cutoff     = 3 * 60 * 1000;
  expiration = new Date().getTime() - cutoff;

  scale = 10; // this should max out around 5 clicks in either direction
  sum   = 50; // start in the middle

  // Loops through and calculates a decaying average
  for (var index = 0; index < paceData.length; index++) {
    notice = paceData[index]

    if(notice.time < expiration) {
      paceData.splice( index, 1 );
    }
    else {
      ratio = (notice.time - expiration) / cutoff;
      sum  += (notice.pace * scale * ratio);
    }
  }

  position = Math.max(Math.min(sum, 90), 10); // between 10 and 90
  console.log("Updating pace position as: " + position);
  $("#paceMarker").css({ left: position+"%" });

  if(position > 75) { $("#paceFast").show() } else { $("#paceFast").hide() }
  if(position < 25) { $("#paceSlow").show() } else { $("#paceSlow").hide() }
}

function zoom()
{
  if(window.innerWidth <= 480) {
    $(".zoomed").css("zoom", 0.32);
  }
  else {
    var hSlide = parseFloat($("#preso").height());
    var wSlide = parseFloat($("#preso").width());
    var hPreview = parseFloat($("#preview").height());
    var wPreview = parseFloat($("#preview").width());
    var factor = parseFloat($("#zoomer").val());

    n =  Math.min(hPreview/hSlide, wPreview/wSlide) - 0.04;

    $(".zoomed").css("zoom", n*factor);
  }
}

// extend this function to add presenter bits
var origGotoSlide = gotoSlide;
gotoSlide = function (slideNum)
{
    origGotoSlide.call(this, slideNum)
    try { slaveWindow.gotoSlide(slideNum, false) } catch (e) {}
    postSlide()
}

function update() {
  if(mode.update) {
    ws.send(JSON.stringify({ message: 'update', slide: slidenum}));
  }
}

// Tell the showoff server that we're a presenter, giving the socket time to initialize
function register() {
  setTimeout( function() {
    try {
      ws.send(JSON.stringify({ message: 'register' }));
    }
    catch(e) {
      console.log("Registration failed. Sleeping");
      // try again, until the socket finally lets us register
      register();
    }
  }, 5000);
}

function presPrevStep()
{
    prevStep();
    try { slaveWindow.prevStep(false) } catch (e) {};
    postSlide();

    update();
}

function presNextStep()
{
/*  // I don't know what the point of this bit was, but it's not needed.
    // read the variables set by our spawner
    incrCurr = slaveWindow.incrCurr
    incrSteps = slaveWindow.incrSteps
*/
	nextStep();
	try { slaveWindow.nextStep(false) } catch (e) {};
	postSlide();

	update();
}

function postSlide()
{
	if(currentSlide) {
/*
		try {
		  // whuuuu?
		  var notes = slaveWindow.getCurrentNotes()
		}
		catch(e) {
		  var notes = getCurrentNotes()
		}
*/
    var notes = getCurrentNotes()
		$('#notes').html(notes.html())

		var fileName = currentSlide.children().first().attr('ref')
		$('#slideFile').text(fileName)
	}
}

//  See e.g. http://www.quirksmode.org/js/keys.html for keycodes
function keyDown(event)
{
	var key = event.keyCode;

	if (event.ctrlKey || event.altKey || event.metaKey)
		return true;

	debug('keyDown: ' + key)

	if (key >= 48 && key <= 57) // 0 - 9
	{
		gotoSlidenum = gotoSlidenum * 10 + (key - 48);
		return true;
	}

	if (key == 13) {
    if (gotoSlidenum > 0) {
      debug('go to ' + gotoSlidenum);
      slidenum = gotoSlidenum - 1;
      showSlide(true);
      try {
        slaveWindow.slidenum = gotoSlidenum - 1;
        slaveWindow.showSlide(true);
      } catch (e) {}
        gotoSlidenum = 0;
    } else {
      debug('executeCode');
      executeAnyCode();
      try { slaveWindow.executeAnyCode(); } catch (e) {}
    }
	}

	if (key == 16) // shift key
	{
		shiftKeyActive = true;
	}

	if (key == 32) // space bar
	{
		if (shiftKeyActive) {
			presPrevStep()
		} else {
			presNextStep()
		}
	}
	else if (key == 68) // 'd' for debug
	{
		debugMode = !debugMode
		doDebugStuff()
	}
	else if (key == 37 || key == 33 || key == 38) // Left arrow, page up, or up arrow
	{
		presPrevStep();
	}
	else if (key == 39 || key == 34 || key == 40) // Right arrow, page down, or down arrow
	{
		presNextStep();
	}
	else if (key == 84 || key == 67)  // T or C for table of contents
	{
		$('#navmenu').toggle().trigger('click')
	}
	else if (key == 83)  // 's' for style
	{
		$('#stylemenu').toggle().trigger('click')
	}
	else if (key == 90 || key == 191) // z or ? for help
	{
		$('#help').toggle()
	}
	else if (key == 66 || key == 70) // f for footer (also "b" which is what kensington remote "stop" button sends
	{
		toggleFooter()
	}
	else if (key == 78) // 'n' for notes
	{
		toggleNotes()
	}
	else if (key == 27) // esc
	{
		removeResults();
		try { slaveWindow.removeResults(); } catch (e) {}
	}
	else if (key == 80) // 'p' for preshow
	{
		try { slaveWindow.togglePreShow(); } catch (e) {}
	}
	return true
}

//* TIMER *//

var timerSetUp = false;
var timerRunning = false;
var intervalRunning = false;
var seconds = 0;
var totalMinutes = 35;

function toggleTimer()
{
  if (!timerRunning) {
    timerRunning = true
    totalMinutes = parseInt($("#timerMinutes").attr('value'))
    $("#minStart").hide()
    $("#minStop").show()
    $("#timerInfo").text(timerStatus(0));
    seconds = 0
    if (!intervalRunning) {
      intervalRunning = true
      setInterval(function() {
        if (!timerRunning) { return; }
        seconds++;
        $("#timerInfo").text(timerStatus(seconds));
      }, 1000);  // fire every minute
    }
  } else {
    seconds = 0
    timerRunning = false
    totalMinutes = 0
    $("#timerInfo").text('')
    $("#minStart").show()
    $("#minStop").hide()
  }
}

function timerStatus(seconds) {
  var minutes = Math.round(seconds / 60);
  var left = (totalMinutes - minutes);
  var percent = Math.round((minutes / totalMinutes) * 100);
  var progress = getSlidePercent() - percent;
  setProgressColor(progress);
  return minutes + '/' + left + ' - ' + percent + '%';
}

function setProgressColor(progress) {
  ts = $('#timerSection')
  ts.removeClass('tBlue')
  ts.removeClass('tGreen')
  ts.removeClass('tYellow')
  ts.removeClass('tRed')
  if(progress > 10) {
    ts.addClass('tBlue')
  } else if (progress > 0) {
    ts.addClass('tGreen')
  } else if (progress > -10) {
    ts.addClass('tYellow')
  } else {
    ts.addClass('tRed')
  }
}

var presSetCurrentStyle = setCurrentStyle;
var setCurrentStyle = function(style, prop) {
  presSetCurrentStyle(style, false);
  try { slaveWindow.setCurrentStyle(style, false); } catch (e) {}
}

function mobile() {
  return ( navigator.userAgent.match(/Android/i)
            || navigator.userAgent.match(/webOS/i)
            || navigator.userAgent.match(/iPhone/i)
            || navigator.userAgent.match(/iPad/i)
            || navigator.userAgent.match(/iPod/i)
            || navigator.userAgent.match(/BlackBerry/i)
            || navigator.userAgent.match(/Windows Phone/i)
  );
}

/********************
 Follower Code
 ********************/
function toggleFollower()
{
  mode.follow = $("#remoteToggle").attr("checked");
  getPosition();
}

function toggleUpdater()
{
  mode.update = $("#followerToggle").attr("checked");
  update();
}

/*
// redefine defaultMode
defaultMode = function() {
  return mobile() ? modeState.follow : modeState.passive;
}
*/
