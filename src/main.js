import './styles.css';

const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.desktop-nav');
menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  nav?.classList.toggle('mobile-open', !isOpen);
});

document.querySelectorAll('.desktop-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    menuToggle?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('mobile-open');
  });
});

const form = document.querySelector('.subscribe-form');
const message = document.querySelector('.form-message');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = form.querySelector('input');
  if (!input.checkValidity()) {
    input.focus();
    return;
  }
  message.textContent = 'You’re on the list — welcome to the quiet side.';
  input.value = '';
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('is-visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.flow-card, .feature-copy, .phone-wrap, .whatsapp-copy, .share-card').forEach((element) => {
  element.classList.add('reveal');
  observer.observe(element);
});
