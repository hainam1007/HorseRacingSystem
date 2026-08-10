export const jockeyPortraits = [
  "https://i.pinimg.com/1200x/e2/9b/73/e29b73519a7852c8cb9c33565dc89ac7.jpg",
  "https://i.pinimg.com/236x/bb/d3/c2/bbd3c26709d6837911ff67212f5bef3b.jpg",
  "https://i.pinimg.com/1200x/fe/26/7b/fe267b6f716f89ba262e451ba1331633.jpg",
  "https://i.pinimg.com/1200x/81/ad/28/81ad28872a4be66c032618e1ae2ec9e3.jpg",
  "https://i.pinimg.com/736x/85/96/58/85965865565fbff16d1327b6610f3560.jpg",
  "https://i.pinimg.com/736x/a8/18/1c/a8181cc7049b30f6b80a2e4066af6602.jpg",
];

export const jockeyActionImages = [
  "https://i.pinimg.com/736x/62/93/aa/6293aaa27bec087e1c70d6665e0b00f5.jpg",
  "https://i.pinimg.com/1200x/17/99/ee/1799eef6ad2001514b70cb7ec51f59b8.jpg",
  "https://i.pinimg.com/736x/a9/5d/8c/a95d8ca8757127b80e9409f4714c979c.jpg",
  "https://i.pinimg.com/1200x/f0/bb/26/f0bb26b403461ab45dc6e585c23e24b3.jpg",
];

export const horseJockeyImages = [
  "https://i.pinimg.com/1200x/4a/99/f3/4a99f3254a934d4a53a8a73479a74961.jpg",
  "https://i.pinimg.com/1200x/d0/19/ac/d019ac635639394194adc426388cad7f.jpg",
  "https://i.pinimg.com/1200x/5e/0b/bc/5e0bbce075688c658695ed2736a5d857.jpg",
];

export const jockeyTrackImages = [
  "https://i.pinimg.com/736x/4d/e7/2f/4de72f60ea3018aafe760f0148a29af6.jpg",
  "https://i.pinimg.com/1200x/3d/ff/a1/3dffa140ed55cb85b21a9e021e4cb2c8.jpg",
  "https://i.pinimg.com/736x/56/b4/2f/56b42f543b435926b04654e794d620f2.jpg",
  "https://i.pinimg.com/1200x/ae/08/50/ae0850e67c950abd7e962008bc7ae3fb.jpg",
];

export const celebrationImages = [
  "https://i.pinimg.com/736x/c6/55/65/c6556591b381822cede4a09c560ebc61.jpg",
  "https://i.pinimg.com/1200x/1d/37/d6/1d37d6451bdee7add205993d1a828578.jpg",
];

export const jockeyProfile = {
  id: "J-014",
  name: "Alex Rider",
  email: "alex.rider@track.example",
  phone: "+84 91 428 6610",
  location: "Ho Chi Minh City, VN",
  license: "Licensed Pro Jockey",
  status: "Available",
  season: "Season 2026",
  stableConnection: "Minh Le Stable",
  weightClass: "54 kg class",
  winRate: "50%",
  podiumRate: "72%",
  earnings: "$26,840",
  availability: "Available Jun 03",
};

export const jockeyInvitations = [
  {
    id: "INV-340",
    horse: "Storm Arrow",
    owner: "Minh Le Stable",
    tournament: "Spring Cup 2026",
    race: "Emerald Sprint",
    date: "Jun 03, 14:00",
    venue: "Grandstand A",
    status: "Pending",
    note: "Owner requests confirmation before equipment check.",
  },
  {
    id: "INV-344",
    horse: "Golden Mane",
    owner: "Minh Le Stable",
    tournament: "Sunset Stakes",
    race: "Sunset Stakes",
    date: "Jun 05, 17:00",
    venue: "Main Track",
    status: "Pending",
    note: "Horse profile review is in progress.",
  },
  {
    id: "INV-331",
    horse: "Night Sprint",
    owner: "Minh Le Stable",
    tournament: "Night Circuit",
    race: "Night Circuit Final",
    date: "Jun 08, 20:00",
    venue: "Arena B",
    status: "Accepted",
    note: "Night race pairing already confirmed.",
  },
];

export const jockeySchedule = [
  { id: "R-101", time: "Jun 03, 14:00", race: "Emerald Sprint", tournament: "Spring Cup 2026", horse: "Storm Arrow", venue: "Grandstand A", round: "Heat 1", status: "Pending" },
  { id: "R-109", time: "Jun 05, 17:00", race: "Sunset Stakes", tournament: "Sunset Stakes", horse: "Golden Mane", venue: "Main Track", round: "Heat 2", status: "Review" },
  { id: "R-116", time: "Jun 08, 20:00", race: "Night Circuit Final", tournament: "Night Circuit", horse: "Night Sprint", venue: "Arena B", round: "Final", status: "Confirmed" },
];

export const jockeyAssignments = [
  { id: "ASG-014", horse: "Storm Arrow", owner: "Minh Le Stable", status: "Pending", race: "Emerald Sprint", note: "Awaiting rider confirmation." },
  { id: "ASG-031", horse: "Night Sprint", owner: "Minh Le Stable", status: "Confirmed", race: "Night Circuit Final", note: "Confirmed pairing for final round." },
  { id: "ASG-044", horse: "Golden Mane", owner: "Minh Le Stable", status: "Review", race: "Sunset Stakes", note: "Horse profile update required before final approval." },
];

export const jockeyResults = [
  { id: "RES-J14", date: "May 24", race: "Kentucky Derby Classic", horse: "Storm Arrow", position: 1, time: "1:10.42", prize: "$12,400", status: "Published" },
  { id: "RES-J11", date: "May 18", race: "Royal Ascot Qualifier", horse: "Blue Horizon", position: 3, time: "1:12.08", prize: "$4,200", status: "Published" },
  { id: "RES-J08", date: "May 10", race: "Dubai Sprint Heat", horse: "Night Sprint", position: 2, time: "1:11.64", prize: "$6,900", status: "Published" },
];

export const jockeyNotifications = [
  "Storm Arrow invitation is waiting for your response.",
  "Night Circuit Final pairing has been confirmed.",
  "Golden Mane needs owner review before acceptance.",
];
