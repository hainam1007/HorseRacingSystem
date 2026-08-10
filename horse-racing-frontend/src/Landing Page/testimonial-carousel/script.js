// Testimonials carousel (vanilla JS)
// Data: change this JSON to update content
const testimonials = [
  {
    id: 1,
    name: 'Nhan DT35',
    role: 'Horse Owner',
    stars: 5,
    text: 'Managing horse registration, jockey assignment, and race confirmation is much easier with the tournament dashboard.',
    // simple SVG avatar as data URL
    img: makeAvatarSVG('HO','#e6f7ff','#6e4d39')
  },
  {
    id: 2,
    name: 'Nhan DT35',
    role: 'Jockey',
    stars: 5,
    text: 'I can quickly review my assigned races, horse details, and results from one screen.',
    img: makeAvatarSVG('JY','#fff0e6','#6e4d39')
  },
  {
    id: 3,
    name: 'Nhan DT35',
    role: 'Race Referee',
    stars: 5,
    text: 'The race confirmation, violation tracking, and result approval flow stays clear and organized.',
    img: makeAvatarSVG('RF','#f0fff0','#6e4d39')
  },
  {
    id: 4,
    name: 'Nhan DT35',
    role: 'Spectator',
    stars: 4,
    text: 'I can follow the live rankings and predictions without losing track of the tournament progress.',
    img: makeAvatarSVG('SP','#f6f1ff','#6e4d39')
  },
  {
    id: 5,
    name: 'Nhan DT35',
    role: 'Admin',
    stars: 5,
    text: 'Managing accounts, schedules, rankings, and predictions in one place keeps the tournament flow organized.',
    img: makeAvatarSVG('AD','#fff7e6','#6e4d39')
  }
]

function makeAvatarSVG(initials, bg, fg){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='900' viewBox='0 0 800 900'><rect width='100%' height='100%' rx='16' fill='${bg}'/><g transform='translate(0,40)'><circle cx='400' cy='220' r='170' fill='#fff' stroke='${bg}' stroke-width='12'/><text x='400' y='240' font-family='Sora, Arial' font-size='92' fill='${fg}' text-anchor='middle' alignment-baseline='middle'>${initials}</text></g></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// DOM
const track = document.getElementById('tc-track')
const carousel = document.getElementById('tc-carousel')
let current = 0

// render slides
function render(){
  track.innerHTML = ''
  testimonials.forEach((t, idx)=>{
    const slide = document.createElement('div')
    slide.className = 'tc-card'
    slide.dataset.index = idx
    // image
    const img = document.createElement('img')
    img.src = t.img
    img.alt = `${t.name} avatar`
    slide.appendChild(img)
    // meta content (visible only on center)
    const meta = document.createElement('div')
    meta.className = 'tc-meta'
    meta.innerHTML = `<div class='quote'>"${t.text}"</div><div class='name'>${t.name}</div><div class='role'>${t.role}</div><div class='rating'>${'★'.repeat(t.stars)}</div>`
    slide.appendChild(meta)
    track.appendChild(slide)
  })
  update()
}

function clampIndex(i){
  const n = testimonials.length
  return ((i % n) + n) % n
}

function update(){
  const slides = Array.from(track.children)
  const n = slides.length
  // center on `current`
  // we will position so that the center slide is in the middle of viewport
  const viewport = carousel.querySelector('.tc-viewport')
  const vpWidth = viewport.clientWidth
  const centerX = vpWidth/2

  // compute offsets by measuring slides
  let offset = 0
  // compute track translateX so that current slide center aligns with viewport center
  // first measure cumulative widths
  const sizes = slides.map(s=>s.getBoundingClientRect().width + parseFloat(getComputedStyle(s).gap||0))
  // but easier: compute index of first slide and position using flex and translate
  // We'll compute slide centers by summing widths
  let cum = 0
  let targetCenter = 0
  for(let i=0;i<n;i++){
    const w = slides[i].getBoundingClientRect().width
    const center = cum + w/2
    if(i===current) targetCenter = center
    cum += w + 28 // gap
  }
  const translate = centerX - targetCenter
  track.style.transform = `translateX(${translate}px)`

  // reset classes
  slides.forEach(s=>{s.classList.remove('center','side','left','right')})
  // mark center, left and right
  const c = current
  const l = clampIndex(c-1)
  const r = clampIndex(c+1)
  slides[c].classList.add('center')
  slides[l].classList.add('side','left')
  slides[r].classList.add('side','right')
}

// navigation
function prev(){ current = clampIndex(current-1); update() }
function next(){ current = clampIndex(current+1); update() }

// attach controls
carousel.querySelector('.tc-prev').addEventListener('click', ()=>{ prev() })
carousel.querySelector('.tc-next').addEventListener('click', ()=>{ next() })

// keyboard
window.addEventListener('keydown',(e)=>{
  if(e.key==='ArrowLeft') prev()
  if(e.key==='ArrowRight') next()
})

// init
render()

// optional autoplayer (commented out):
// setInterval(()=>{ next() }, 5000)
