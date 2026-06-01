const fs = require('fs');
const DB_FILE = './data.json';

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    options: [], members: {}, weeklyLog: [], lastWeekLog: [], assignmentPool: []
  }, null, 2));
}

const OPTIONS = [
  // ZIKR VƏ DUA
  "100 dəfə SubhənAllah de",
  "100 dəfə Əlhəmdülillah de",
  "100 dəfə Allahu Əkbər de",
  "100 dəfə Lə iləhə illəllah de",
  "1000 dəfə Əstağfirullah de",
  "100 dəfə Saləvatı-şərif de",
  "Ayətəl-Kürsini hər namazdan sonra oxu",
  "Yatmazdan əvvəl 33 SubhənAllah, 33 Əlhəmdülillah, 34 Allahu Əkbər de",
  "Bu gün hər namazdan sonra 10 dəfə saləvat gətir",

  // QURAN
  "Kafirun surəsini əzbərlə",
  "İxlas surəsini 100 dəfə oxu",
  "Mülk surəsini oxu",
  "Yasin surəsini oxu",
  "Vaqiə surəsini oxu",
  "Rəhman surəsini oxu",
  "Quran oxu — ən azı 1 səhifə",
  "Quran oxu — ən azı 5 səhifə",
  "Ayətəl-Kürsini əzbərlə",
  "Bəqərə surəsinin son 2 ayəsini əzbərlə",
  "Fatiha surəsinin mənasını öyrən",
  "Nəbə surəsini oxu",
  "Duha surəsini əzbərlə",
  "İnşirah surəsini əzbərlə",
  "Fələq və Nas surələrini hər gün 3 dəfə oxu",

  // NAMAZ
  "Bütün 5 vaxt namazı vaxtında qıl",
  "Gecə 2 rükət tahəccüd namazı qıl",
  "Günün hər namazından əvvəl sünnə namazları qıl",

  // SƏDƏQƏ VƏ YARDIM
  "5 manat sədəqə ver",
  "Qazancının 1 faizi qədər sədəqə ver",
  "Bir yoxsula yardım et",
  "Bir ehtiyaclı ailəyə ərzaq al",
  "Birinin borcunu ödə (bacardığın qədər) və ya sənə borcu olanın borcunu bağışla (bacardığın qədər)",
  "Bir xeyriyyə fonduna köçürmə et",

  // İSLAMİ ELM VƏ OXUMAQ
  "Hz. Muhəmmədin (s.ə.s) həyatı haqqında kitab oxu",
  "Hz. Muhəmmədin (s.ə.s) həyatı haqqında sənədli filmlə bax",
  "İslam tarixi haqqında öyrən",
  "Bir hədis əzbərlə",
  "Əsmaül-Hüsna (Allahın 99 adı) haqqında öyrən",

  // İNSANLARA FAYDA
  "Bir nəfərin Cüməyə getməsinə səbəb ol",
  "Birini namaza dəvət et",
  "Bir nəfərə Quran hədiyyə et",
  "Bir yaxınınla əlaqə saxla — uzun müddətdir görüşməmisənsə",

  // NƏFSİ TƏRBİYƏ
  "Bir gün nafile oruc tut",
  "Bu gün heç yalan danışma",
  "Bu gün qıybət etmə",
  "Bu gün hər kəslə gülümsəyərək danış",
  "Bu gün kimdənsə üzr istə — haqqını incitdiyinə",
];

const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
data.options = [...data.options, ...OPTIONS];
fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
console.log(`✅ ${OPTIONS.length} tapşırıq əlavə edildi. Cəmi: ${data.options.length}`);
