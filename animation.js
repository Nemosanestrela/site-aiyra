const journey = document.querySelector('.journey');
const scene = document.querySelector('.scene');
const root = document.documentElement;
const motionPreference = window.matchMedia('(prefers-reduced-motion: no-preference)');
let pendingFrame = 0;
let lastProgress;

// The easing depends on position alone, so scrolling back retraces every layer.
function easeSegment(progress, start, end) {
  const t = Math.min(1, Math.max(0, (progress - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function render() {
  pendingFrame = 0;
  if (!motionPreference.matches) return;

  const bounds = journey.getBoundingClientRect();
  const distance = bounds.height - scene.getBoundingClientRect().height;
  const progress = distance > 0 ? Math.min(1, Math.max(0, -bounds.top / distance)) : 1;
  if (progress === lastProgress) return;
  lastProgress = progress;

  const character = easeSegment(progress, 0.11, 0.84);
  const logoLift = easeSegment(progress, 0.2, 0.95);
  const logoVisibility = easeSegment(progress, 0.23, 0.62);
  root.classList.toggle('has-visible-logo', logoVisibility >= 0.9);
  const rearLeaves = easeSegment(progress, 0, 1);
  const upper = easeSegment(progress, 0.02, 0.86);
  const left = easeSegment(progress, 0.04, 0.95);
  const right = easeSegment(progress, 0.07, 0.98);

  scene.style.setProperty('--character-y', `${3.4 * (1 - character)}%`);
  scene.style.setProperty('--logo-y', `${44 * (1 - logoLift)}%`);
  scene.style.setProperty('--logo-opacity', logoVisibility);
  scene.style.setProperty('--rear-leaves-progress', rearLeaves);
  scene.style.setProperty('--upper-y', `${-56 * upper}%`);
  scene.style.setProperty('--left-x', `${-69 * left}%`);
  scene.style.setProperty('--right-x', `${68 * right}%`);
}

function scheduleRender() {
  if (motionPreference.matches && !pendingFrame) {
    pendingFrame = window.requestAnimationFrame(render);
  }
}

function whenDecoded(image) {
  if (image.complete) return image.decode();

  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(image.decode()), { once: true });
    image.addEventListener('error', reject, { once: true });
  });
}

function revealImage(image, revealSeparately) {
  image.classList.add('waiting-image');

  return whenDecoded(image).then(() => {
    if (revealSeparately || !root.classList.contains('is-loading')) {
      image.classList.add('arriving-image');
    }
    image.classList.remove('waiting-image');
  }, () => {});
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function revealForest(imagesReady) {
  const cover = document.querySelector('.loading-screen');
  const drift = cover.querySelector('.loading-drift');
  await Promise.allSettled(drift.getAnimations().map((animation) => animation.finished));
  if (!root.classList.contains('is-loading') || !motionPreference.matches) {
    root.classList.remove('is-loading');
    return;
  }

  root.classList.add('is-landed');
  // Let the green become visible before growing the light, even with cached images.
  await Promise.all([imagesReady, wait(320)]);
  if (!root.classList.contains('is-loading') || !motionPreference.matches) {
    root.classList.remove('is-loading', 'is-landed');
    return;
  }

  render();
  root.classList.add('is-expanding');
  const reveal = cover.getAnimations().find((animation) => animation.animationName === 'forest-reveal');
  if (reveal) await Promise.allSettled([reveal.finished]);
  root.classList.remove('is-loading', 'is-expanding', 'is-landed');
}

root.classList.add('has-motion');
render();

window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', scheduleRender);
window.addEventListener('pageshow', scheduleRender);
motionPreference.addEventListener('change', scheduleRender);

if (root.classList.contains('is-loading')) {
  const artwork = [...scene.querySelectorAll('img')];
  revealForest(Promise.all(artwork.map((image) => revealImage(image, false))));

  for (const image of document.querySelectorAll('.footer img')) {
    revealImage(image, true);
  }
}

const floatingLight = document.querySelector('.floating-light');
const flightPath = floatingLight.querySelector('.floating-light-path');
const lightParticles = document.createElement('span');
lightParticles.className = 'light-particles';
floatingLight.append(lightParticles);
const firstFlightDelay = 7000;
const repeatDelayStep = 3000;
const lightTouchRadius = 38;
let flightTimer;
let activeFlight;
let hasScrolled = false;
let firstFlightAt;
let repeatFlightDelay = 11000;

function floatingLightAllowed() {
  return hasScrolled && motionPreference.matches && !document.hidden && !root.classList.contains('is-loading');
}

function randomFlightPath(width, height) {
  const start = Math.floor(Math.random() * 4);
  const direction = Math.random() < 0.5 ? 1 : -1;
  const points = Array.from({ length: 4 }, (_, index) => {
    const quadrant = (start + direction * index + 4) % 4;
    const right = quadrant === 1 || quadrant === 2;
    const bottom = quadrant >= 2;
    return [
      width * ((right ? 0.58 : 0.12) + 0.30 * Math.random()),
      height * ((bottom ? 0.58 : 0.12) + 0.30 * Math.random()),
    ];
  });

  // Match the incoming and outgoing tangents so the light flows through each point.
  const segments = points.slice(1).map((end, index) => {
    const current = points[index];
    const previous = points[index - 1] ?? current;
    const next = points[index + 2] ?? end;
    const outgoing = current.map((value, axis) => value + (end[axis] - previous[axis]) / 6);
    const incoming = end.map((value, axis) => value - (next[axis] - current[axis]) / 6);
    return `C ${outgoing.join(' ')} ${incoming.join(' ')} ${end.join(' ')}`;
  });
  return `path("M ${points[0].join(' ')} ${segments.join(' ')}")`;
}

function flyFloatingLight() {
  flightTimer = undefined;
  if (!floatingLightAllowed()) return;

  firstFlightAt = undefined;
  floatingLight.hidden = false;
  const path = randomFlightPath(floatingLight.clientWidth, floatingLight.clientHeight);
  animateFloatingLight(path, [
    { offset: 0, offsetDistance: '0%', transform: 'scale(1.2)', opacity: 0 },
    { offset: 0.18, opacity: 1 },
    { offset: 0.76, opacity: 1 },
    { offset: 1, offsetDistance: '100%', transform: 'scale(0.7)', opacity: 0 },
  ], { duration: 6200 + Math.random() * 1400, easing: 'ease-in-out', id: 'drift' });
}

async function animateFloatingLight(path, keyframes, options) {
  activeFlight?.cancel();
  flightPath.style.offsetPath = path;
  const flight = flightPath.animate(keyframes, options);
  activeFlight = flight;

  await Promise.allSettled([flight.finished]);
  if (activeFlight !== flight) return;

  activeFlight = undefined;
  clearLightParticles();
  floatingLight.hidden = true;
  scheduleFloatingLight();
  repeatFlightDelay += repeatDelayStep;
}

function clearLightParticles() {
  for (const animation of lightParticles.getAnimations({ subtree: true })) animation.cancel();
  lightParticles.replaceChildren();
}

function burstLightParticles(position) {
  clearLightParticles();

  for (let index = 0; index < 12; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'light-particle';
    particle.style.left = `${position.left}px`;
    particle.style.top = `${position.top}px`;
    particle.style.width = `${1.5 + Math.random() * 2}px`;
    lightParticles.append(particle);

    const angle = (index + Math.random() * 0.65) * Math.PI * 2 / 12;
    const distance = 24 + Math.random() * 64;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const particleFlight = particle.animate([
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { offset: 0.12, opacity: 1 },
      { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.2)`, opacity: 0 },
    ], { duration: 500 + Math.random() * 150, easing: 'cubic-bezier(0.16, 0.7, 0.3, 1)', fill: 'forwards' });
    particleFlight.finished.catch(() => {});
  }
}

function expandFloatingLight(event) {
  if (!event.isPrimary || event.button !== 0 || activeFlight?.id !== 'drift') return;
  if (event.target.closest('button, a, input, select, textarea, label, [role="button"], [contenteditable], .video-player')) return;

  const { offsetDistance, transform, opacity } = getComputedStyle(flightPath);
  const currentScale = new DOMMatrixReadOnly(transform).a;
  const position = flightPath.getBoundingClientRect();
  const distance = Math.hypot(event.clientX - position.left, event.clientY - position.top);
  if (Number(opacity) < 0.2 || distance > lightTouchRadius * currentScale) return;

  burstLightParticles(position);
  // Keep the core at the touched point while the particles disperse around it.
  animateFloatingLight(flightPath.style.offsetPath, [
    { offsetDistance, transform, opacity, easing: 'ease-out' },
    { offset: 0.22, transform: `scale(${currentScale * 1.12})`, opacity: Number(opacity) * 0.35, easing: 'ease-in-out' },
    { offsetDistance, transform: `scale(${currentScale * 0.35})`, opacity: 0 },
  ], { duration: 650, id: 'dissolve' });
}

function scheduleFloatingLight() {
  if (flightTimer !== undefined || activeFlight || !floatingLightAllowed()) return;

  const delay = firstFlightAt === undefined ? repeatFlightDelay : Math.max(0, firstFlightAt - performance.now());
  flightTimer = setTimeout(flyFloatingLight, delay);
}

function stopFloatingLight() {
  clearTimeout(flightTimer);
  flightTimer = undefined;
  activeFlight?.cancel();
  activeFlight = undefined;
  clearLightParticles();
  floatingLight.hidden = true;
}

function syncFloatingLight() {
  if (floatingLightAllowed()) scheduleFloatingLight();
  else stopFloatingLight();
}

const loadingObserver = new MutationObserver(syncFloatingLight);
loadingObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('scroll', function startFloatingLight() {
  if (window.scrollY <= 0) return;
  hasScrolled = true;
  firstFlightAt = performance.now() + firstFlightDelay;
  scheduleFloatingLight();
  window.removeEventListener('scroll', startFloatingLight);
}, { passive: true });
document.addEventListener('pointerdown', expandFloatingLight, { passive: true });
document.addEventListener('visibilitychange', syncFloatingLight);
motionPreference.addEventListener('change', syncFloatingLight);
window.addEventListener('pagehide', stopFloatingLight);
window.addEventListener('pageshow', syncFloatingLight);
syncFloatingLight();

const videoPlay = document.querySelector('.video-play');

videoPlay.addEventListener('click', () => {
  // Local files cannot send the referrer required by embedded YouTube players.
  if (location.protocol === 'file:') {
    const note = videoPlay.nextElementSibling;
    note.hidden = false;
    note.textContent = 'Abra o endereço do site para reproduzir o vídeo aqui.';
    return;
  }

  const videoId = videoPlay.dataset.youtubeId;
  const player = document.createElement('iframe');
  player.title = videoPlay.getAttribute('aria-label');
  player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  player.allowFullscreen = true;
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  player.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1`;
  videoPlay.replaceWith(player);
  player.focus();
});

const manualBlocks = document.querySelectorAll('[data-reveal]');
const careTrails = document.querySelectorAll('.care-trail');
const preparationTitle = document.querySelector('.manual-preparation h4');
const stepBlocks = document.querySelectorAll('.germination-flow [data-reveal], .after-germination [data-reveal]');
let manualObserver;
let manualFrame;
let lastManualScrollY = window.scrollY;
let preparationPassed = false;

function drawCareTrails() {
  manualFrame = undefined;
  if (!motionPreference.matches) return;

  const nextScrollY = window.scrollY;
  const preparationTop = preparationTitle.getBoundingClientRect().top;
  if (preparationPassed && nextScrollY < lastManualScrollY && preparationTop >= 0) {
    for (const block of stepBlocks) {
      block.classList.remove('is-revealed');
      manualObserver.observe(block);
    }
    // Commit the hidden state before visible steps enter again.
    void preparationTitle.offsetHeight;
    preparationPassed = false;
  }
  if (preparationTop < 0) preparationPassed = true;
  lastManualScrollY = nextScrollY;

  for (const trail of careTrails) {
    const bounds = trail.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight * 0.8 - bounds.top) / (bounds.height + innerHeight * 0.2)));
    trail.style.setProperty('--trail-hidden', 1 - progress);
  }
}

function scheduleCareTrails() {
  if (manualFrame === undefined && motionPreference.matches) {
    manualFrame = requestAnimationFrame(drawCareTrails);
  }
}

function updateManualMotion() {
  manualObserver?.disconnect();
  root.classList.toggle('has-manual-motion', motionPreference.matches);
  if (!motionPreference.matches) {
    for (const trail of careTrails) trail.style.removeProperty('--trail-hidden');
    return;
  }

  manualObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        manualObserver.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  for (const block of manualBlocks) {
    if (!block.classList.contains('is-revealed')) manualObserver.observe(block);
  }
  drawCareTrails();
}

window.addEventListener('scroll', scheduleCareTrails, { passive: true });
window.addEventListener('resize', scheduleCareTrails);
window.addEventListener('pageshow', scheduleCareTrails);
motionPreference.addEventListener('change', updateManualMotion);
updateManualMotion();

const forestAudio = document.getElementById('forest-audio');
const soundToggle = document.querySelector('.sound-toggle');
const soundControl = document.querySelector('.sound-control');
const soundHint = document.getElementById('sound-hint');
const maximumVolume = 0.85;
const volumeFadeDuration = 2400;
let soundEnabled = false;
let hintShown = false;
let compactTimer;
let volumeFrame;
let audioContext;
let audioGain;
let audioSource;

function updateSoundButton() {
  const compact = soundControl.classList.contains('is-compact');
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  soundToggle.setAttribute('aria-expanded', String(!compact));
  soundToggle.setAttribute('aria-label', compact ? 'Mostrar controle de áudio' :
    soundEnabled ? 'Desativar áudio ambiente' : 'Ativar áudio ambiente');
}

function hideSoundHint() {
  soundControl.classList.remove('has-hint');
  soundHint.setAttribute('aria-hidden', 'true');
}

function scheduleSoundCollapse(milliseconds = 4500) {
  clearTimeout(compactTimer);
  compactTimer = setTimeout(() => {
    hideSoundHint();
    soundControl.classList.add('is-compact');
    updateSoundButton();
  }, milliseconds);
}

function syncSoundControl() {
  const visible = !root.classList.contains('is-loading') &&
    (!motionPreference.matches || root.classList.contains('has-visible-logo'));
  if (visible === soundControl.classList.contains('is-visible')) return;
  soundControl.classList.toggle('is-visible', visible);
  if (!visible) {
    clearTimeout(compactTimer);
    hideSoundHint();
    if (hintShown) soundControl.classList.add('is-compact');
  } else if (!hintShown) {
    hintShown = true;
    soundControl.classList.add('has-hint');
    soundHint.setAttribute('aria-hidden', 'false');
    scheduleSoundCollapse(4500);
  }
  updateSoundButton();
}

function prepareAudioGain() {
  if (audioGain || location.protocol === 'file:') return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    audioContext = new Context();
    audioSource = audioContext.createMediaElementSource(forestAudio);
    audioGain = audioContext.createGain();
    audioGain.gain.value = 0;
    audioSource.connect(audioGain);
    audioGain.connect(audioContext.destination);
  } catch {
    // Older browsers can fade the media element's own volume.
    audioGain = undefined;
  }
}

function fadeInForestAudio() {
  cancelAnimationFrame(volumeFrame);
  if (audioGain) {
    const curve = Float32Array.from({ length: 64 }, (_, index) => {
      const progress = index / 63;
      return maximumVolume * progress * progress * (3 - 2 * progress);
    });
    const now = audioContext.currentTime;
    audioGain.gain.cancelScheduledValues(now);
    audioGain.gain.setValueCurveAtTime(curve, now, volumeFadeDuration / 1000);
    return;
  }
  const start = performance.now();
  const fade = (time) => {
    if (!soundEnabled) return;
    const progress = Math.min(1, (time - start) / volumeFadeDuration);
    forestAudio.volume = maximumVolume * progress * progress * (3 - 2 * progress);
    if (progress < 1) volumeFrame = requestAnimationFrame(fade);
  };
  volumeFrame = requestAnimationFrame(fade);
}

soundToggle.addEventListener('click', () => {
  if (soundControl.classList.contains('is-compact')) {
    soundControl.classList.remove('is-compact');
    updateSoundButton();
    scheduleSoundCollapse();
    return;
  }
  hideSoundHint();
  soundEnabled = !soundEnabled;
  updateSoundButton();
  scheduleSoundCollapse();
  cancelAnimationFrame(volumeFrame);
  if (!soundEnabled) {
    forestAudio.pause();
    if (audioGain) {
      audioGain.gain.cancelScheduledValues(audioContext.currentTime);
      audioGain.gain.setValueAtTime(0, audioContext.currentTime);
    }
    return;
  }
  prepareAudioGain();
  forestAudio.volume = audioGain ? 1 : 0;
  const playback = forestAudio.play();
  const resumed = audioContext?.resume();
  Promise.all([playback, resumed]).then(() => {
    if (soundEnabled) fadeInForestAudio();
  }).catch(() => {
    soundEnabled = false;
    forestAudio.pause();
    updateSoundButton();
  });
});

const soundObserver = new MutationObserver(syncSoundControl);
soundObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
motionPreference.addEventListener('change', syncSoundControl);
syncSoundControl();

const bookOrder = document.querySelector('.book-order');
const orderPlant = document.querySelector('.creation-plant');
let orderFrame;

function updateBookOrder() {
  orderFrame = undefined;
  // Use layout coordinates so the plant's floating animation cannot retrigger the button.
  const parent = orderPlant.offsetParent;
  const plantBottom = parent.getBoundingClientRect().top + parent.clientTop + orderPlant.offsetTop + orderPlant.offsetHeight;
  const lastScrollPosition = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const entryPosition = Math.min(window.scrollY + plantBottom, lastScrollPosition);
  const visible = window.scrollY >= entryPosition - 1;
  root.classList.toggle('has-book-order', visible);
  bookOrder.classList.toggle('is-visible', visible);
  bookOrder.inert = !visible;
  bookOrder.setAttribute('aria-hidden', String(!visible));
}

function scheduleBookOrder() {
  if (orderFrame === undefined) orderFrame = requestAnimationFrame(updateBookOrder);
}

window.addEventListener('scroll', scheduleBookOrder, { passive: true });
window.addEventListener('resize', scheduleBookOrder);
window.addEventListener('pageshow', scheduleBookOrder);
document.fonts.ready.then(scheduleBookOrder);
updateBookOrder();
