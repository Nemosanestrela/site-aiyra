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
const firstFlightDelay = 7000;
const repeatFlightDelay = 11000;
const lightTouchRadius = 38;
let flightTimer;
let activeFlight;
let hasScrolled = false;
let firstFlightAt;

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
    { offset: 0, offsetDistance: '0%', opacity: 0, easing: 'ease-out' },
    { offset: 0.22, opacity: 1, easing: 'ease-in-out' },
    { offset: 0.72, opacity: 0.97, easing: 'ease-in' },
    { offset: 1, offsetDistance: '100%', opacity: 0 },
  ], { duration: 6200 + Math.random() * 1400, id: 'drift' });
}

async function animateFloatingLight(path, keyframes, options) {
  activeFlight?.cancel();
  flightPath.style.offsetPath = path;
  const flight = flightPath.animate(keyframes, options);
  activeFlight = flight;

  await Promise.allSettled([flight.finished]);
  if (activeFlight !== flight) return;

  activeFlight = undefined;
  floatingLight.hidden = true;
  scheduleFloatingLight();
}

function dodgeTouch(event) {
  if (event.pointerType !== 'touch' || !event.isPrimary || activeFlight?.id !== 'drift') return;
  if (event.target.closest('button, a, input, select, textarea, label, [role="button"], [contenteditable], .video-player')) return;

  const opacity = Number(getComputedStyle(flightPath).opacity);
  const position = flightPath.getBoundingClientRect();
  if (opacity < 0.2 || Math.hypot(event.clientX - position.left, event.clientY - position.top) > lightTouchRadius) return;

  // Start the escape at the light's current screen position and head past a corner.
  const viewport = floatingLight.getBoundingClientRect();
  const x = position.left - viewport.left;
  const y = position.top - viewport.top;
  const exitX = x < viewport.width / 2 ? -90 : viewport.width + 90;
  const exitY = y < viewport.height / 2 ? -90 : viewport.height + 90;
  const bendX = x + (exitX - x) * 0.64;
  const bendY = y + (exitY - y) * 0.23;
  const path = `path("M ${x} ${y} Q ${bendX} ${bendY} ${exitX} ${exitY}")`;
  animateFloatingLight(path, [
    { offsetDistance: '0%', opacity },
    { offset: 0.28, opacity },
    { offsetDistance: '100%', opacity: 0 },
  ], { duration: 650, easing: 'cubic-bezier(0.18, 0.64, 0.3, 1)', id: 'escape' });
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
document.addEventListener('pointerdown', dodgeTouch, { passive: true });
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
