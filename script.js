const particleContainer = document.querySelector('.background-particles');
const sections = document.querySelectorAll('.reveal');
const ctaButton = document.querySelector('.cta-button');
const parallaxLines = document.querySelector('.parallax-lines');

function createParticles(count = 40) {
    if (!particleContainer) return;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
        const particle = document.createElement('span');
        const size = Math.random() * 4 + 3;
        const duration = Math.random() * 10 + 8;
        const delay = Math.random() * -12;

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${duration}s`;
        particle.style.animationDelay = `${delay}s`;

        fragment.appendChild(particle);
    }

    particleContainer.appendChild(fragment);
}

function setupObserver() {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        {
            threshold: 0.2,
            rootMargin: '0px 0px -80px 0px',
        }
    );

    sections.forEach((section) => observer.observe(section));
}

function smoothScroll(targetId) {
    const el = document.getElementById(targetId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function initParallax() {
    if (!parallaxLines) return;
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        parallaxLines.style.transform = `translate3d(${scrolled * -0.08}px, ${scrolled * 0.12}px, 0)`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    createParticles(50);
    setupObserver();
    initParallax();

    if (ctaButton) {
        ctaButton.addEventListener('click', () => {
            const target = ctaButton.getAttribute('data-scroll');
            if (target) smoothScroll(target);
        });
    }
});
