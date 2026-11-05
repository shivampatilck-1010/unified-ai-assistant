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
    var maxRecorded = 120;
    var origArc = CanvasRenderingContext2D.prototype.arc;
    var origFill = CanvasRenderingContext2D.prototype.fill;
    var origClearRect = CanvasRenderingContext2D.prototype.clearRect;

    // Reset recorded shapes on each animation frame to eliminate memory leaks and 0% lag
    var origRAF = window.requestAnimationFrame;
    if (origRAF) {
      window.requestAnimationFrame = function(cb) {
        return origRAF.call(window, function(ts) {
          recordedShapes.length = 0;
          return cb(ts);
        });
      };
    }

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
        if (recordedShapes.length < maxRecorded) {
          recordedShapes.push({
            x: this._lastArc.x,
            y: this._lastArc.y,
            r: this._lastArc.r,
            color: this.fillStyle,
            time: performance.now()
          });
        }
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
        if (d <= (s.r * scaleX) + 16 && d < minD) {
          found = s;
          minD = d;
        }
      }

      var oCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;

      if (found) {
        if (oCtx) drawReticle(oCtx, found.x, found.y, found.r);

        var pageText = ((document.body ? document.body.innerText : '') + ' ' + document.title).toLowerCase();
        try {
          if (window.parent && window.parent.document) {
            pageText += ' ' + (window.parent.document.title || '').toLowerCase();
          }
        } catch (e) {}

        var isRocket = pageText.includes('throttle') || pageText.includes('altitude') || pageText.includes('nozzle') || pageText.includes('rocket') || pageText.includes('engine') || pageText.includes('o/f') || pageText.includes('shutdown') || pageText.includes('thrust') || pageText.includes('exhaust') || pageText.includes('plume') || pageText.includes('combustion');
        var isPhotochem = !isRocket && (pageText.includes('photochem') || pageText.includes('photolysis') || pageText.includes('laser') || pageText.includes('wavelength') || pageText.includes('cl2') || pageText.includes('radical'));

        var title = "Kinetic Gas Molecule / Fluid Parcel";
        var cat = "Thermodynamic Particle";
        var desc = "High-velocity gas molecule in active thermodynamic continuum, exchanging momentum and heat flux.";
        var stats = [
          { label: "Molecular State", value: "Excited Gas Molecule" },
          { label: "Kinetic Velocity", value: "v = √(3k_B T / m)" },
          { label: "Continuum Phase", value: "Compressible Fluid" }
        ];

        var relX = found.x / (canvas.width || 1);
        var cStr = String(found.color).toLowerCase();

        if (isRocket) {
          var isH2O = cStr.includes('blue') || cStr.includes('cyan') || cStr.includes('yellow') || cStr.includes('white') || found.r < 3.2;
          var isCO2 = cStr.includes('orange') || cStr.includes('amber') || (found.r >= 3.2 && found.r < 4.2);
          var isCO = cStr.includes('red') || cStr.includes('coral') || cStr.includes('pink');
          var isH2 = cStr.includes('purple') || cStr.includes('violet');

          if (relX < 0.28) {
            // Chamber Region
            if (isCO2) {
              title = "Carbon Dioxide Molecule (CO₂)";
              cat = "Chamber Combustion Product (20%)";
              desc = "Heavy triatomic gas molecule (44.01 g/mol) formed via complete hydrocarbon oxidation. High molecular mass provides dense momentum transfer in chamber pressure of 7.2 MPa.";
              stats = [
                { label: "Chemical Formula", value: "CO₂ (Carbon Dioxide)" },
                { label: "Molecular Weight", value: "44.01 g/mol" },
                { label: "Chamber Temp (T_c)", value: "3,380 K (3,107 °C)" },
                { label: "Chamber Pressure (P_c)", value: "7.2 MPa (71 atm)" },
                { label: "Exhaust Fraction", value: "20% Molar Yield" }
              ];
            } else if (isCO) {
              title = "Carbon Monoxide Molecule (CO)";
              cat = "Equilibrium Dissociation Gas (9%)";
              desc = "Formed at extreme chamber temperatures (>3,200 K) via chemical equilibrium dissociation (CO₂ ⇌ CO + ½ O₂).";
              stats = [
                { label: "Chemical Formula", value: "CO (Carbon Monoxide)" },
                { label: "Molecular Weight", value: "28.01 g/mol" },
                { label: "Chamber Temp (T_c)", value: "3,380 K" },
                { label: "Reaction Eq", value: "CO₂ ⇌ CO + ½ O₂" },
                { label: "Exhaust Fraction", value: "9% Molar Yield" }
              ];
            } else if (isH2) {
              title = "Molecular Hydrogen Gas (H₂)";
              cat = "Fuel-Rich Accelerant (5%)";
              desc = "Ultralight diatomic gas (2.016 g/mol) resulting from fuel-rich operation. Drastically lowers mean molar mass, maximizing specific impulse Isp.";
              stats = [
                { label: "Chemical Formula", value: "H₂ (Hydrogen Gas)" },
                { label: "Molecular Weight", value: "2.016 g/mol (Ultralight)" },
                { label: "Kinetic Velocity", value: "> 4,100 m/s" },
                { label: "Exhaust Fraction", value: "5% Molar Yield" }
              ];
            } else {
              title = "Superheated Steam Molecule (H₂O)";
              cat = "Primary Propellant Exhaust (66%)";
              desc = "Superheated gaseous water steam formed from liquid oxidizer (LOX) and hydrocarbon fuel (CH₄ / RP-1) reaction under extreme chamber pressure.";
              stats = [
                { label: "Chemical Formula", value: "H₂O (Superheated Steam)" },
                { label: "Molecular Weight", value: "18.015 g/mol" },
                { label: "Chamber Temp (T_c)", value: "3,380 K (3,107 °C)" },
                { label: "Chamber Pressure (P_c)", value: "7.2 MPa (72 atm)" },
                { label: "Exhaust Fraction", value: "66% Molar Yield" }
              ];
            }
          } else if (relX >= 0.28 && relX <= 0.46) {
            // Throat Constriction Region
            title = "Choked Sonic Gas Molecule (Mach 1.0)";
            cat = "Transonic Throat Flow";
            desc = "Converging-diverging throat constriction (A*) where accelerating gas reaches exactly acoustic speed (Mach 1.0), isentropically converting stagnation thermal enthalpy into directional axial kinetic energy.";
            stats = [
              { label: "Gas Species", value: "Accelerating H₂O Steam, CO₂, CO, H₂" },
              { label: "Throat Mach", value: "M = 1.00 (Choked Sonic Flow)" },
              { label: "Acoustic Velocity (a*)", value: "1,120 m/s" },
              { label: "Critical Pressure (P*)", value: "4.06 MPa (0.564 · P_c)" },
              { label: "Mass Flow Rate (ṁ)", value: "ṁ = A* · P_c / c*" }
            ];
          } else {
            // Supersonic Plume Region
            var plumeName = isCO2 ? "Carbon Dioxide (CO₂)" : isCO ? "Carbon Monoxide (CO)" : isH2 ? "Hydrogen Gas (H₂)" : "Superheated Steam (H₂O)";
            title = "Supersonic Plume: " + plumeName;
            cat = "Supersonic Exhaust Gas (Mach 3.5+)";
            desc = "Expanding supersonic exhaust molecule exiting the bell nozzle skirt into atmosphere or vacuum. As pressure drops isentropically, kinetic velocity surges to ~3,150 m/s, driving reactive vehicle thrust.";
            stats = [
              { label: "Exhaust Substance", value: plumeName },
              { label: "Exhaust Velocity (v_e)", value: "3,150 m/s (Mach 3.4 - 4.2)" },
              { label: "Static Temperature", value: "Adiabatically Cooled (T_e ≈ 1,420 K)" },
              { label: "Reactive Thrust", value: "F = ṁ · v_e + (P_e - P_a) · A_e" },
              { label: "Plume Morphology", value: "Altitude Expansion (Shock Diamonds / Bell Plume)" }
            ];
          }
        } else if (isPhotochem) {
          if (cStr.includes('yellow') || cStr.includes('gold') || found.r < 5) {
            title = "Incident UV Photon Packet (hν)";
            cat = "Electromagnetic Wavepacket";
            desc = "Quantized light wavepacket with energy E = hν. Imparts electronic excitation energy upon absorption by diatomic reactant molecules.";
            stats = [
              { label: "Photon Energy", value: "E = hν = hc/λ" },
              { label: "Wavelength", value: "λ = 200 - 400 nm (UV)" },
              { label: "Role", value: "Homolytic Cleavage Initiator" }
            ];
          } else if (cStr.includes('green') || cStr.includes('emerald') || found.r >= 7) {
            title = "Diatomic Reactant Molecule (Cl₂)";
            cat = "Ground State Halogen (S₀)";
            desc = "Diatomic molecule undergoing photodissociation. UV absorption promotes electrons into the σ* antibonding orbital, breaking the covalent bond.";
            stats = [
              { label: "Bond Energy (D₀)", value: "242 kJ/mol (2.51 eV)" },
              { label: "Threshold λ", value: "494 nm" },
              { label: "State", value: "Ground State (S₀)" }
            ];
          } else {
            title = "Chlorine Free Radical (Cl•)";
            cat = "Open-Shell Reactive Intermediate";
            desc = "Free radical with an unpaired valence electron (•) formed via homolytic cleavage. Rapidly abstracts hydrogen from hydrocarbons.";
            stats = [
              { label: "Spin State", value: "Doublet (1 Unpaired Electron •)" },
              { label: "Reactivity", value: "Extremely High (k ~ 10¹⁰ M⁻¹s⁻¹)" },
              { label: "Propagation", value: "Cl• + CH₄ ⟶ HCl + •CH₃" }
            ];
          }
        }

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
  <style>${INJECTED_INSPECTOR_STYLE}</style>
  <script>${INJECTED_INSPECTOR_SCRIPT}</script>
`;
