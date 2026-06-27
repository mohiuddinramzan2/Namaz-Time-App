// সরল গাণিতিক হিজরি তারিখ কনভার্টার (কোনো API লাগে না)
// Kuwaiti algorithm-ভিত্তিক approximation — অধিকাংশ ইসলামিক অ্যাপে ব্যবহৃত পদ্ধতি
const HIJRI_MONTHS = [
    "মুহাররম", "সফর", "রবিউল আউয়াল", "রবিউস সানি",
    "জমাদিউল আউয়াল", "জমাদিউস সানি", "রজব", "শাবান",
    "রমজান", "শাওয়াল", "জিলক্বদ", "জিলহজ্জ"
];

function gregorianToHijri(date) {
    const jd = Math.floor(
        (1461 * (date.getFullYear() + 4800 + (date.getMonth() + 1 - 14) / 12)) / 4 +
        (367 * (date.getMonth() + 1 - 2 - 12 * ((date.getMonth() + 1 - 14) / 12))) / 12 -
        (3 * ((date.getFullYear() + 4900 + (date.getMonth() + 1 - 14) / 12) / 100)) / 4 +
        date.getDate() - 32075
    );

    const l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
              Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
    const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
               Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const month = Math.floor((24 * l3) / 709);
    const day = l3 - Math.floor((709 * month) / 24);
    const year = 30 * n + j - 30;

    return { day, month, year };
}

function getHijriDateString(date) {
    const h = gregorianToHijri(date || new Date());
    const monthName = HIJRI_MONTHS[(h.month - 1 + 12) % 12] || "";
    return `${h.day} ${monthName}, ${h.year} হিজরি`;
}
