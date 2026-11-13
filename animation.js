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
  const upper = easeSegment(progress, 0.02, 0.86);
  const left = easeSegment(progress, 0.04, 0.95);
  const right = easeSegment(progress, 0.07, 0.98);

  scene.style.setProperty('--character-y', `${3.4 * (1 - character)}%`);
  scene.style.setProperty('--logo-y', `${44 * (1 - logoLift)}%`);
  scene.style.setProperty('--logo-opacity', logoVisibility);
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
  await Promise.all([wait(1450), imagesReady.then(() => wait(700))]);
  if (!root.classList.contains('is-loading') || !motionPreference.matches) {
    root.classList.remove('is-loading');
    return;
  }

  const cover = document.querySelector('.loading-screen');
  root.classList.add('is-expanding');
  const [expansion] = cover.querySelector('.loading-bloom').getAnimations();
  if (expansion) await Promise.allSettled([expansion.finished]);
  await wait(170);

  render();
  root.classList.remove('is-loading');
  await Promise.allSettled(cover.getAnimations().map((transition) => transition.finished));
  root.classList.remove('is-expanding');
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
