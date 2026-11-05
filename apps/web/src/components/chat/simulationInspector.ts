// Universal Sandboxed Generative UI Simulation Inspector
// Injected into iframe srcDoc to provide Claude Editorial inspection & precision reticle targeting

export const INJECTED_INSPECTOR_STYLE = `
  #sim-hud-tooltip {
    position: fixed;
    z-index: 999999;
    pointer-events: none;
    background: rgba(26, 25, 23, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(217, 119, 87, 0.4);
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.85), 0 0 16px rgba(217, 119, 87, 0.15);
    border-radius: 9px;
    padding: 11px 13px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #faf9f5;
    max-width: 270px;
    min-width: 200px;
    display: none;
    transition: opacity 0.12s ease;
  }
  .sim-hud-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 6px;
  }
  .sim-hud-about-tag {
    background: rgba(217, 119, 87, 0.18);
    color: #e08365;
    border: 1px solid rgba(217, 119, 87, 0.4);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .sim-hud-cat-tag {
    font-size: 9px;
    font-weight: 600;
    color: #b0aca2;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .sim-hud-title {
    font-size: 13px;
    font-weight: 600;
    color: #faf9f5;
    margin-bottom: 4px;
    line-height: 1.3;
    font-family: 'Newsreader', Georgia, serif;
  }
  .sim-hud-desc {
    font-size: 10.5px;
    color: #b0aca2;
    line-height: 1.45;
    margin-bottom: 7px;
  }
  .sim-hud-stats {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .sim-hud-stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .sim-hud-stat-label {
    color: #8c877d;
    font-size: 9.5px;
  }
  .sim-hud-stat-val {
    color: #e08365;
    font-weight: 600;
    font-size: 10.5px;
  }
`;

export const INJECTED_INSPECTOR_SCRIPT = `
  (function() {
    var tooltip = document.createElement('div');
    tooltip.id = 'sim-hud-tooltip';
    document.body.appendChild(tooltip);

    var recordedShapes = [];
    var origArc = CanvasRenderingContext2D.prototype.arc;
    var origFill = CanvasRenderingContext2D.prototype.fill;
    var origClearRect = CanvasRenderingContext2D.prototype.clearRect;

    CanvasRenderingContext2D.prototype.clearRect = function(x, y, w, h) {
      recordedShapes.length = 0;
      return origClearRect.apply(this, arguments);
    };

    CanvasRenderingContext2D.prototype.arc = function(x, y, r, sa, ea) {
      this._lastArc = { x: x, y: y, r: r };
      return origArc.apply(this, arguments);
    };

    CanvasRenderingContext2D.prototype.fill = function() {
      if (this._lastArc) {
        recordedShapes.push({
          x: this._lastArc.x,
          y: this._lastArc.y,
          r: this._lastArc.r,
          color: this.fillStyle,
          time: performance.now()
        });
        this._lastArc = null;
      }
      return origFill.apply(this, arguments);
    };

    var overlayCanvas = null;
    function setupOverlay(canvas) {
      if (overlayCanvas) return;
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.style.position = 'absolute';
      overlayCanvas.style.left = canvas.offsetLeft + 'px';
      overlayCanvas.style.top = canvas.offsetTop + 'px';
      overlayCanvas.style.width = canvas.offsetWidth + 'px';
      overlayCanvas.style.height = canvas.offsetHeight + 'px';
      overlayCanvas.width = canvas.width || canvas.offsetWidth;
      overlayCanvas.height = canvas.height || canvas.offsetHeight;
      overlayCanvas.style.pointerEvents = 'none';
      overlayCanvas.style.zIndex = '9999';
      canvas.parentNode.insertBefore(overlayCanvas, canvas.nextSibling);
    }

    function drawReticle(ctx, x, y, r) {
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      if (!x) return;
      ctx.save();
      ctx.strokeStyle = '#d97757';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = '#faf9f5';
      ctx.lineWidth = 1.5;
      var tick = 5;
      var d = r + 7;
      ctx.beginPath();
      ctx.moveTo(x, y - d); ctx.lineTo(x, y - d - tick);
      ctx.moveTo(x, y + d); ctx.lineTo(x, y + d + tick);
      ctx.moveTo(x - d, y); ctx.lineTo(x - d - tick, y);
      ctx.moveTo(x + d, y); ctx.lineTo(x + d + tick, y);
      ctx.stroke();
      ctx.restore();
    }

    window.addEventListener('mousemove', function(e) {
      var canvas = document.querySelector('canvas');
      if (!canvas) return;
      setupOverlay(canvas);

      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      var scaleX = canvas.width / (rect.width || 1);
      var scaleY = canvas.height / (rect.height || 1);
      var canvasX = mx * scaleX;
      var canvasY = my * scaleY;

      var found = null;
      var minD = Infinity;

      for (var i = recordedShapes.length - 1; i >= 0; i--) {
        var s = recordedShapes[i];
        var d = Math.hypot(s.x - canvasX, s.y - canvasY);
        if (d <= (s.r * scaleX) + 14 && d < minD) {
          found = s;
          minD = d;
        }
      }

      var oCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;

      if (found) {
        if (oCtx) drawReticle(oCtx, found.x, found.y, found.r);

        var title = "Render Node (Particle)";
        var cat = "Canvas Object";
        var desc = "Dynamic graphic primitive in simulation viewport. Radius: " + Math.round(found.r) + "px.";
        var stats = [
          { label: "Position", value: "(" + Math.round(found.x) + ", " + Math.round(found.y) + ")" },
          { label: "Radius", value: Math.round(found.r) + " px" },
          { label: "Fill Color", value: String(found.color).slice(0, 16) }
        ];

        var statsHtml = stats.map(function(s) {
          return '<div class="sim-hud-stat-item"><span class="sim-hud-stat-label">' + s.label + ':</span><span class="sim-hud-stat-val">' + s.value + '</span></div>';
        }).join('');

        tooltip.innerHTML = 
          '<div class="sim-hud-badge-row">' +
            '<span class="sim-hud-about-tag">INSPECT</span>' +
            '<span class="sim-hud-cat-tag">' + cat + '</span>' +
          '</div>' +
          '<div class="sim-hud-title">' + title + '</div>' +
          '<div class="sim-hud-desc">' + desc + '</div>' +
          '<div class="sim-hud-stats">' + statsHtml + '</div>';

        tooltip.style.display = 'block';
        var tipW = 260;
        var posX = e.clientX + 16 + tipW > window.innerWidth ? e.clientX - tipW - 12 : e.clientX + 16;
        var posY = e.clientY + 14;
        tooltip.style.left = Math.max(8, posX) + 'px';
        tooltip.style.top = Math.max(8, posY) + 'px';
      } else {
        if (oCtx) oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        tooltip.style.display = 'none';
      }
    });

    window.addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
      if (overlayCanvas) {
        var oCtx = overlayCanvas.getContext('2d');
        if (oCtx) oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
    });
  })();
`;

export const INJECTED_SIMULATION_INSPECTOR_HTML = `
  <style>${INJECTED_INSPECTOR_STYLE}</style>
  <script>${INJECTED_INSPECTOR_SCRIPT}</script>
`;
