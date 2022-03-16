// Adapted by Andy Race
// Based on https://github.com/maryrosecook/retro-games

// ReSharper disable VariableUsedInInnerScopeBeforeDeclared
; (function () {
  var Game = function() {
    this.debug = false;

    var screen = document.getElementById("screen").getContext("2d");

    screen.canvas.width  = window.innerWidth;
    screen.canvas.height = window.innerHeight;
  
    this.size = { x: screen.canvas.width, y: screen.canvas.height };
    this.center = { x: this.size.x / 2, y: this.size.y / 2 };

    this.bodies = [
      new Asteroid(this, { x: 0, y: 75 }, 50),
      new Asteroid(this, { x: 75, y: 75 }, 30),
      new Asteroid(this, { x: 225, y: 75 }, 30),
      new Asteroid(this, { x: 150, y: 225 }, 30),
      new Player(this)
    ];

    this.shootSound = document.getElementById("shoot-sound");
    this.shootSound.load();
    this.explosionSound = document.getElementById("explosion-sound");
    this.explosionSound.load();

    this.nBullets = 0;

    var self = this;
    var tick = function() {
      self.update();
      self.draw(screen);
      requestAnimationFrame(tick);
    };

    tick();
  };

  Game.prototype = {
    update: function() {
      reportCollisions(this.bodies);
      
      this.bodies.forEach(function(body) {
        body.update();
      });
    },

    draw: function(screen) {
      screen.clearRect(0, 0, this.size.x, this.size.y);
      this.bodies.forEach(function(body) {
        body.draw(screen);
      });
    },

    addBody: function(body) {
      this.bodies.push(body);
      if(body instanceof Bullet) {
        this.nBullets++;
      }
    },

    removeBody: function(body) {
      var bodyIndex = this.bodies.indexOf(body);
      if (bodyIndex !== -1) {
        this.bodies.splice(bodyIndex, 1);

        if(body instanceof Bullet) {
          this.nBullets--;
        }
      }

      if (body instanceof Player || body instanceof Asteroid) {
        this.explosionSound.play();
      }

      if (body instanceof Player) {
        this.addBody(new DyingPlayer(body));
      }
    },

    wrapIfOffScreen: function(obj) {
      var screen = geom.rect(this);
      if ((obj.points.filter(function(p) { return p.x > screen.l; }).length === 0 &&
           obj.velocity.x < 0) ||
          (obj.points.filter(function(p) { return p.x < screen.r; }).length === 0 &&
           obj.velocity.x > 0)) {
        moveBody(obj, { x: this.size.x - obj.center.x, y: obj.center.y });
      } else if ((obj.points.filter(function(p) { return p.y > screen.t; }).length === 0 &&
                  obj.velocity.y < 0) ||
                 (obj.points.filter(function(p) { return p.y < screen.b; }).length === 0 &&
                  obj.velocity.y > 0)) {
        moveBody(obj, { x: obj.center.x, y: this.size.y - obj.center.y });
      }
    }
  };

  var Asteroid = function(game, center, radius) {
    this.game = game;
    this.angle = 0;
    this.center = center;
    this.radius = radius;
    this.points = asteroidPoints(center, radius, 10);
    this.velocity = { x: Math.random() - 0.5, y: Math.random() - 0.5 };
  };

  Asteroid.prototype = {
    update: function() {
      moveBody(this, geom.translate(this.center, this.velocity));
      this.game.wrapIfOffScreen(this);
    },

    draw: function(screen) {
      drawLinesFromPoints(screen, this.points);
    },

    collision: function(otherBody) {
      if (otherBody instanceof Player || otherBody instanceof Bullet) {
        this.game.removeBody(this);
        this.game.removeBody(otherBody);
        if (this.radius > 10) {
          var radius = this.radius - 10;
          this.game.addBody(new Asteroid(this.game, { x: this.center.x, y: this.center.y }, radius));
          this.game.addBody(new Asteroid(this.game, { x: this.center.x, y: this.center.y }, radius));
        }
      }
    }
  };

  var drawLines = function(screen, lines) {
    lines.forEach(function(line) {
      drawLine(screen, line);
    });
  };

  var drawLinesFromPoints = function(screen, points, connectedLines) {
    drawLines(screen, pointsToLines(points, connectedLines));
  };

  var moveBody = function(body, center) {
    var translation = geom.vectorTo(body.center, center);
    body.center = center;
    body.points = body.points.map(function(x) { return geom.translate(x, translation); });
  };

  var DyingPlayer = function(player) {
    this.lifetime = 100;
    this.lineWidth = player.lineWidth;
    this.game = player.game;
    this.center = player.center;
    this.points = [];

    this.lines = pointsToLines(player.points, false);

    this.lines = this.lines.map(function(line) {
      var newLine = line;
      
      newLine.angleDelta = Math.random() * 0.04 - 0.002;

      newLine.axis = 
        { x: line[0].x + Math.random() * (line[1].x - line[0].x),
          y: line[0].y + Math.random() * (line[1].y - line[0].y) };

      newLine.velocity =
        { x: player.velocity.x * Math.random(),
          y: player.velocity.y * Math.random() };

      newLine.lineWidthDelta = -Math.random() / 20;
      newLine.lineWidth = player.lineWidth;
      
      return newLine;
    });
  };
  
  DyingPlayer.prototype = {
    update: function() {
      if (this.lifetime-- === 0) {
        this.game.removeBody(this);
        return;
      }

      this.lines = this.lines.map(function(line) {
        line[0] = geom.translate(line.velocity, geom.rotate(line[0], line.axis, line.angleDelta));
        line[1] = geom.translate(line.velocity, geom.rotate(line[1], line.axis, line.angleDelta));
        line.axis = geom.translate(line.velocity, line.axis);
        line.lineWidth += line.lineWidthDelta;
        return line;
      });
    },

    draw: function(screen) {
      screen.save();
      try {
        screen.strokeStyle = "#702082"; // WTW Purple

        this.lines.forEach(function(line) {
          screen.lineWidth = line.lineWidth;
          drawLine(screen, line);
        });
      } finally {
        screen.restore();
      }
    }
  }

  var Player = function(game) {
    this.game = game;
    this.angle = 0;
    this.center = { x: this.game.center.x, y: this.game.center.y };

//    this.points = [{ x: this.center.x - 8, y: this.center.y + 9 },
//                   { x: this.center.x,     y: this.center.y - 10 },
//                   { x: this.center.x + 8, y: this.center.y + 9 }];

    var width = (this.game.debug === true) ? 128 : 32;
    
    var gap = 1;

    // letter segment width
    var w = Math.floor(width / 8);

    // resize the ship based on the letter + gap width
    this.width = Math.floor(9 * (w + gap) - gap);
    this.height = w * 3;

    var blobH = this.height / 2;

    this.lineWidth = w;

    var originX = this.center.x - (this.width / 2) + w / 2;
    var originY = this.center.y - (this.height / 2);
    var i = 0;

    var self = this;

    var addBlob = function (i, offsetY, h) { 
      var x = originX + (w + gap) * i;
      var y = originY + offsetY;
      self.points.push( {x: x, y: y });
      self.points.push( {x: x, y: y + h });
    }

    this.points = [];
    
    // W
    addBlob(i++, 0, this.height);
    addBlob(i++, (this.height - blobH), blobH);
    addBlob(i++, 0, this.height);

    // T
    addBlob(i++, 0, blobH);
    addBlob(i++, 0, this.height);
    addBlob(i++, 0, blobH);

    // W
    addBlob(i++, 0, this.height);
    addBlob(i++, (this.height - blobH), blobH);
    addBlob(i++, 0, this.height);

    this.velocity = { x: 0, y: 0 };
    this.keyboarder = new Keyboarder();
    this.lastShotTime = 0;
  };

  Player.prototype = {
    update: function() {
      if (this.keyboarder.isDown(this.keyboarder.KEYS.LEFT)) {
        this.turn(-Math.PI/30);
      } else if (this.keyboarder.isDown(this.keyboarder.KEYS.RIGHT)) {
        this.turn(Math.PI/30);
      }

      if (this.keyboarder.isDown(this.keyboarder.KEYS.UP)) {
        var newVelocity = geom.translate(
                            this.velocity,
                            geom.rotate({ x: 0, y: -0.05 }, { x: 0, y: 0 }, this.angle));

        if (geom.lineLength(newVelocity) < 5) {
          this.velocity = newVelocity;
        }
      }

      var now = new Date().getTime();
      if (this.keyboarder.isDown(this.keyboarder.KEYS.SPACE)
          && (now - this.lastShotTime > 50)
          && (this.game.nBullets < 5)) {
        this.lastShotTime = now;
        
        this.game.shootSound.play();

        var bulletPos = geom.rotate(
          { x: this.center.x, y: this.center.y - this.height / 2 - 1 },
          this.center,
          this.angle);
        
        var bullet = new Bullet(this.game,
          bulletPos,
          this.velocity,
          this.angle);
          
        this.game.addBody(bullet);
      }

      moveBody(this, geom.translate(this.center, this.velocity));
      this.game.wrapIfOffScreen(this);
    },

    turn: function(angleDelta) {
      var center = this.center;
      this.points = this.points.map(function(x) { return geom.rotate(x, center, angleDelta); });
      this.angle += angleDelta;
    },

    draw: function(screen) {
      screen.save();
      try {
        screen.strokeStyle = "#702082"; // WTW Purple
        screen.lineWidth = this.lineWidth;
        drawLinesFromPoints(screen, this.points, false);

        if (this.game.debug === true) {
          screen.lineWidth = 1;

          var line;

          line = [geom.translate(this.center, {x: -this.width, y: 0}),
                  geom.translate(this.center, {x: this.width, y: 0})];
          line = [geom.rotate(line[0], this.center, this.angle),
                  geom.rotate(line[1], this.center, this.angle)];
          drawLine(screen, line);

          line = [geom.translate(this.center, {x: 0, y: -this.height}),
                  geom.translate(this.center, {x: 0, y: this.height})];
          line = [geom.rotate(line[0], this.center, this.angle),
                  geom.rotate(line[1], this.center, this.angle)];
          drawLine(screen, line);
        }
      } finally {
        screen.restore();
      }
    }
  };

  var Bullet = function(game, start, velocity, angle) {
    this.game = game;
    this.velocity = geom.translate(velocity, geom.rotate({ x: 0, y: -5 }, { x: 0, y: 0 }, angle));
    this.angle = angle;
    this.center = start;
    this.points = [start, geom.translate(start, this.velocity)];
    this.ticksLeft = 100;
  };

  Bullet.prototype = {
    update: function() {
      if (this.ticksLeft-- === 0) {
        this.game.removeBody(this);
      }

      moveBody(this, geom.translate(this.center, this.velocity));
      this.game.wrapIfOffScreen(this);
    },

    draw: function(screen) {
      var w = 2;
      screen.fillRect(this.center.x - w/2, this.center.y - w/2, w, w);
    },

    collision: function(otherBody) {
      if (otherBody instanceof Asteroid) {
        this.game.removeBody(this);
        this.game.removeBody(otherBody);
      }
    }
  };

  var Keyboarder = function() {
    var keyState = {};

    window.addEventListener("keydown", function(e) {
      keyState[e.keyCode] = true;
    });

    window.addEventListener("keyup", function(e) {
      keyState[e.keyCode] = false;
    });

    this.isDown = function(keyCode) {
      return keyState[keyCode] === true;
    };

    this.KEYS = { LEFT: 37, RIGHT: 39, UP: 38, SPACE: 32 };
  };

  var pointsToLines = function(points, connectedLines) {
    var lines = [];
    if(points.length > 0) {
      var previous = points[0];
      for(var i = 1; i < points.length; i++) {
        lines.push([previous, points[i]]);

        if (connectedLines === false) {
          i++;
        }

        previous = points[i];
      }

      if (connectedLines !== false && lines.length > 0) {
        lines.push([previous, lines[0][0]]); // end to beginning
      }
    }

    return lines;
  };

  var drawLine = function(screen, line) {
    screen.beginPath();
    screen.moveTo(line[0].x, line[0].y);
    screen.lineTo(line[1].x, line[1].y);
    screen.stroke();
  };

  var asteroidPoints = function(center, radius, pointCount) {
    var points = [];
    for (var a = 0; a < 2 * Math.PI; a += 2 * Math.PI / pointCount) {
      var random = Math.random();
      points.push(geom.rotate({
        x: center.x + radius * (0.2 + random),
        y: center.y - radius * (0.2 + random)
      }, center, a));
    }

    return points;
  };

  var pairs = function(a, b) {
    var pairs = [];
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        pairs.push([a[i], b[j]]);
      }
    }
    return pairs;
  };

  var isColliding = function(b1, b2) {
    if (b1 === b2) return false;
    return pairs(pointsToLines(b1.points), pointsToLines(b2.points))
      .filter(function(x) {
        return geom.linesIntersecting(x[0], x[1]);
      }).length > 0;
  };

  var reportCollisions = function(bodies) {
    var collisions = [];
    var i;
    for (i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        if (isColliding(bodies[i], bodies[j])) {
          collisions.push([bodies[i], bodies[j]]);
        }
      }
    }

    for (i = 0; i < collisions.length; i++) {
      if (collisions[i][0].collision !== undefined) {
        collisions[i][0].collision(collisions[i][1]);
      }

      if (collisions[i][1].collision !== undefined) {
        collisions[i][1].collision(collisions[i][0]);
      }
    }
  };

  var geom = {
    translate: function(point, translation) {
      return { x: point.x + translation.x, y: point.y + translation.y };
    },

    vectorTo: function(point1, point2) {
      return { x: point2.x - point1.x, y: point2.y - point1.y };
    },

    rotate: function(point, pivot, angle) {
      return {
        x: (point.x - pivot.x) * Math.cos(angle) -
          (point.y - pivot.y) * Math.sin(angle) +
          pivot.x,
        y: (point.x - pivot.x) * Math.sin(angle) +
          (point.y - pivot.y) * Math.cos(angle) +
          pivot.y
      };
    },

    linesIntersecting: function(a, b) {
      var d = (b[1].y - b[0].y) * (a[1].x - a[0].x) -
          (b[1].x - b[0].x) * (a[1].y - a[0].y);
      var n1 = (b[1].x - b[0].x) * (a[0].y - b[0].y) -
          (b[1].y - b[0].y) * (a[0].x - b[0].x);
      var n2 = (a[1].x - a[0].x) * (a[0].y - b[0].y) -
          (a[1].y - a[0].y) * (a[0].x - b[0].x);

      if (d === 0.0) return false;
      return n1 / d >= 0 && n1 / d <= 1 && n2 / d >= 0 && n2 / d <= 1;
    },

    rect: function(obj) {
      return {
        l: obj.center.x - obj.size.x / 2,
        r: obj.center.x + obj.size.x / 2,
        t: obj.center.y - obj.size.y / 2,
        b: obj.center.y + obj.size.y / 2
      }
    },

    lineLength: function(obj) {
      return Math.sqrt(obj.x * obj.x + obj.y * obj.y);
    }
  };

  window.addEventListener("load", function() {
    new Game();
  });
})();
