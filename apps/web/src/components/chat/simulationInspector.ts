// Universal Sandboxed Generative UI Simulation Inspector
// Injected into iframe srcDoc to provide [? ABOUT] hover cards & precision reticle targeting

export const INJECTED_INSPECTOR_STYLE = `
  #sim-hud-tooltip {
    position: fixed;
    z-index: 999999;
    pointer-events: none;
    background: rgba(7, 7, 9, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(56, 189, 248, 0.5);
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.85), 0 0 20px rgba(56, 189, 248, 0.2);
    border-radius: 10px;
    padding: 12px 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
    color: #f1f5f9;
    max-width: 280px;
    min-width: 210px;
    display: none;
    transition: opacity 0.12s ease;
  }
  .sim-hud-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 7px;
    gap: 6px;
  }
  .sim-hud-about-tag {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.45);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .sim-hud-cat-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: #a5b4fc;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .sim-hud-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .sim-hud-desc {
    font-size: 11px;
    color: #cbd5e1;
    line-height: 1.45;
    margin-bottom: 8px;
  }
  .sim-hud-stats {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 3.5px;
    font-size: 10.5px;
    font-family: monospace;
  }
  .sim-hud-stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .sim-hud-stat-label {
    color: #94a3b8;
    font-size: 10px;
  }
  .sim-hud-stat-val {
    color: #38bdf8;
    font-weight: 600;
    font-size: 11px;
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
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(x, y, r + 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      var tick = 6;
      var d = r + 9;
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
        if (d <= (s.r * scaleX) + 16 && d < minD) {
          found = s;
          minD = d;
        }
      }

      var oCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;

      if (found) {
        if (oCtx) drawReticle(oCtx, found.x, found.y, found.r);

        var cStr = String(found.color).toLowerCase();
        var title = "Reactant Atom / Radical (•R)";
        var cat = "Chemical Molecule";
        var desc = "Ground-state reactant particle. In photochemical reactions, absorbing light photons (hν) excites electrons to initiate chemical bond breakage and radical formation.";
        var stats = [
          { label: "State", value: "Ground State (S₀)" },
          { label: "Photoreactivity", value: "Active" },
          { label: "Bond Type", value: "Covalent" }
        ];

        if (cStr.includes('fde047') || cStr.includes('fef08a') || cStr.includes('yellow') || cStr.includes('gold') || found.r < 5) {
          title = "Photon Packet (hν)";
          cat = "Light Quantum";
          desc = "Quantized unit of electromagnetic radiation. Transfers energy (E = hν) to reactant molecules upon absorption, inducing electronic excitation.";
          stats = [
            { label: "Energy", value: "E = hν" },
            { label: "Speed", value: "c (Light Speed)" },
            { label: "Role", value: "Photolysis Initiator" }
          ];
        } else if (cStr.includes('818cf8') || cStr.includes('purple') || cStr.includes('violet') || found.r > 12) {
          title = "Excited Intermediate / Heavy Core";
          cat = "Excited State (S₁)";
          desc = "Molecule with electrons promoted to antibonding orbitals via photon absorption, lowering the activation energy barrier for subsequent reactions.";
          stats = [
            { label: "Energy Level", value: "Excited (S₁)" },
            { label: "Lifetime", value: "~10⁻⁹ s" },
            { label: "Stability", value: "Transient" }
          ];
        } else if (cStr.includes('38bdf8') || cStr.includes('cyan') || cStr.includes('blue')) {
          title = "Reaction Product / Free Radical";
          cat = "Reaction Product";
          desc = "Free radical or molecular product formed following photolytic cleavage of the reactant bond.";
          stats = [
            { label: "Spin State", value: "Radical (•)" },
            { label: "Reactivity", value: "Extremely High" }
          ];
        }

        var statsHtml = stats.map(function(s) {
          return '<div class="sim-hud-stat-item"><span class="sim-hud-stat-label">' + s.label + ':</span><span class="sim-hud-stat-val">' + s.value + '</span></div>';
        }).join('');

        tooltip.innerHTML = 
          '<div class="sim-hud-badge-row">' +
            '<span class="sim-hud-about-tag">? ABOUT</span>' +
            '<span class="sim-hud-cat-tag">' + cat + '</span>' +
          '</div>' +
          '<div class="sim-hud-title">' + title + '</div>' +
          '<div class="sim-hud-desc">' + desc + '</div>' +
          '<div class="sim-hud-stats">' + statsHtml + '</div>';

        tooltip.style.display = 'block';
        var tipW = 270;
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
  <style>\${INJECTED_INSPECTOR_STYLE}</style>
  <script>\${INJECTED_INSPECTOR_SCRIPT}</script>
`;
