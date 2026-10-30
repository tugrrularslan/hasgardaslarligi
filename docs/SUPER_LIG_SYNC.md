# Süper Lig fikstür ve sonuç eşitlemesi

Yönetici panelindeki **Süper Lig'i Eşitle** düğmesi, aktif sezonun Süper Lig
fikstürünü tek bir istekte içeri alır ve mevcut kayıtları güvenli biçimde
günceller. Aynı uç nokta GitHub Actions tarafından saatte bir otomatik çağrılır. Ücretli veri sağlayıcısı kullanılmaz.

## Kaynak ve doğrulama

- TFF'nin herkese açık fikstür sayfası, resmi hafta numarası ve iç/dış saha
  eşleşmesi için asıl kaynaktır.
- ESPN'in anahtarsız herkese açık Süper Lig akışı, gerçek başlangıç tarihi/saatini
  ve sonuç için ikinci doğrulamayı sağlar.
- Bir sonuç ancak TFF ve ESPN aynı skorla tamamlandı gösterdiğinde puanlanır.
  Çelişkili ya da eksik veri yalnızca yöneticiye bildirilir; skor, tahmin ve
  puanlar değişmez.
- TFF'nin sayfasında 18 takım için 34 hafta ve 306 maç görülmüyorsa veya iki
  kaynakta bütün eşleşmeler bulunmuyorsa işlem tamamen durur. Kısmi fikstür
  yazılmaz.

## Veri güvenliği

- Her içe alınan maçın TFF maç kimliği saklanır. Böylece ikinci eşitlemede yeni
  maç oluşturulmaz.
- Eski, elle oluşturulmuş maçlar aynı sezon + hafta + ev sahibi + deplasman
  eşleşmesiyle bulunur ve mevcut belge kimliği korunur. Tahminler bu kimlikte
  kaldığı için silinmez veya kopmaz.
- Eşitleme hiçbir maçı silmez. Yinelenen eski kayıtlar belirsiz olduğu için
  atlanır ve yöneticiye bildirilir.
- Planlanmış maçlarda hafta, takım adı, tarih, saat ve tahmin son zamanı
  güncellenir. Sonuçlanmış maçların skor düzeltmesi mevcut, sürümlemeli puan
  hesaplama yolundan geçer.
- Tamamlanan maçların ESPN özetinden golcü ve oyuncu bazlı asist toplamları
  otomatik alınır. Özetin maç kimliği, takımları, tamamlanma durumu ve skoru
  iki kaynakla doğrulanmış sonuçla eşleşmelidir. Penaltı golleri sayılır;
  seri penaltılar ve iptal edilen olaylar sayılmaz. Kendi kalesine golün
  asist kaydı oluşturulmaz.
- Kaynak gol bazında asist bağlantısı vermiyorsa asistler ilgili takım kartında gollerin altında
  oyuncu ve toplam sayı olarak gösterilir; rastgele bir gole bağlanmaz.
  Gol ve asist krallığı aynı toplamları kullanır; asist iki kez sayılmaz.
- Eski eksik kayıtlar en yeni maçlardan başlanarak, her çalışmada en fazla
  12 maç olacak şekilde tamamlanır. Dört paralel istek ve istek başına sekiz
  saniye sınırı kullanılır. Hiç kontrol edilmemiş maçlar yeniden denemelerden
  önce işlenir. Doğrulanmış ayrıntılar günde bir, eksik ayrıntılar saatte bir
  yeniden kontrol edilir. Yönetici tarafından girilen gol ayrıntıları korunur.
- Ayrıntı tamamlama yalnızca gol/asist alanlarını günceller; sonuç, puanlama
  sürümü, kullanıcı puanı, aktif hafta ve şampiyon kaydına dokunmaz.
- Haricî kaynak golcü ayrıntısı doğrulanamadığında skor yine işlenebilir; maç
  `goalDetailsStatus: "unavailable"` olarak işaretlenir. Yönetici dilerse
  sonradan mevcut sonuç düzenleme ekranından golcüleri ekleyebilir.

## Bilerek otomatikleştirilmeyenler

Eşitleme `publishedWeeks` kaydını değiştirmez, bildirim yollamaz ve yeni hafta
yayınlamaz. Haftayı yayınlama/geçirme ve haftalık şampiyon bonusunu verme
yönetici panelindeki mevcut açık düğmelerle, manuel olarak yapılır. Sonuç
düzeltmesi daha önce elle verilmiş bir haftalık bonusu mevcut kurala göre
yeniden denetleyebilir; ilk kez bonus vermez.

## Maliyet ve kullanım

Bu kurulum Cloud Functions, Cloud Scheduler, Cloud Tasks ve Vercel Cron
eklemez. Normal bir eşitlemede bir TFF ve iki ESPN okuma isteği, yalnızca
değişen Firestore maç belgeleri ve sonuçlanan mevcut maçların mevcut puan
hesaplama yazmaları oluşur. İlk çalıştırma eski, sezonsuz maçları korumak için
bir kez geniş eşleştirme yapar; sonra yalnızca aktif sezon sorgulanır. Veri sağlayıcı API anahtarı gerekmez. Otomasyon kurulumu aşağıdadır.

Yerel veri kuralları için `npm test`, canlı kaynakla salt-okunur uyumluluk
kontrolü için ise `npm run test:super-lig-source` kullanılır.

## Otomatik çalışma ve kimlik doğrulama

GitHub Actions görevi her saatin 17. dakikasında çalışır. Elle denemek için
Actions → Süper Lig sonuçlarını eşitle → Run workflow → main kullanılır.
Varsayılan üretim adresi `https://hasgardaslarligi.vercel.app` şeklindedir;
`SUPER_LIG_SITE_URL` Actions değişkeniyle hedef adres değiştirilebilir.

Vercel veya GitHub'a ortak gizli anahtar girilmez. Her çalışmada GitHub'dan
kısa süreli OIDC kimliği alınır ve sunucuda GitHub'ın resmi imza anahtarlarıyla
doğrulanır. İmza, süre, issuer, audience ve subject denetiminden sonra yalnızca
`1307847878` kimlikli `tugrrularslan/hasgardaslarligi` deposunun, `307523598`
kimlikli sahibinin, main dalındaki `.github/workflows/super-lig-sync.yml`
görevinin `schedule` veya `workflow_dispatch` çalışmaları kabul edilir.
Başka depo, dal, görev veya pull request kimliği sonuç kaydedemez.
Deponun `use_immutable_subject` ayarıyla uyumlu, sahip ve depo sayısal
kimliklerini içeren subject biçimi doğrulanır.

Workflow'un `id-token: write` izni yalnızca GitHub kimliği almak içindir;
depo içeriği yazma izni verilmez. Normal yönetici düğmesi mevcut Firebase
oturumuyla çalışır. `SUPER_LIG_SYNC_SECRET` ve `CRON_SECRET` bu uç noktada
kullanılmaz; eski özel eşitleme anahtarı artık kaldırılabilir.

Standart Linux çalıştırıcısı kullanılır. Açık depoda GitHub Actions
ücretsizdir; Firebase ve Vercel ücretsiz kotaları geçerlidir. GitHub
zamanlaması gecikebilir. Başarısız görev sonraki saatte tekrar çalışır;
sonuç ve puanlama hataları çalışma günlüklerine bildirilir.

## Aktif hafta

`settings/currentSeason.activeWeek` ve `activeWeekSeasonId` yalnızca yönetici
haftayı yayınladığında/seçtiğinde yazılır. Otomasyon bu belgeye yazmaz.
Tahmin ekranı açıldığında bu ayarı okur; haftalar arasında gezinme yalnızca
sayfanın belleğinde tutulur. Maçların bitmesi, tahmin kaydetme ve fikstür
indirme aktif haftayı değiştirmez. Başka sezonun haftası kullanılmaz. İlk
kurulumda yönetici hafta seçene kadar açıklama ve hafta gezinme düğmeleri
sunulur; tahmin tarihinden hafta türetilmez.

Yayın öncesi: `npm test`, `npx tsc --noEmit`, `npm run build` çalıştırın.
Canlı kaynak kontrolü `npm run test:super-lig-source` salt okunurdur. Gerçek
Firebase yazma/puanlama doğrulaması, üretime geçmeden önce ayrı bir test
Firebase projesinde yönetici hesabıyla yapılmalıdır.

Aynı tamamlanmış sonuç değiştirilmeden yeniden kaydedildiğinde, formun gol
sırasını ev/deplasman olarak gruplaması dahil, mevcut asist toplamları korunur.
Açık bir yönetici asist düzeltmesi mevcut kural uyarınca kaynak toplamını
manuel kayıtla değiştirir. Eşitleme yanıtında en son tamamlanan maçın asist
kaydı da yeniden okunarak raporlanır; sonuç yalnızca yazma sayacına dayanmaz.


## Yönetici sonuç formu

Kaynak yalnızca oyuncu bazlı asist toplamı verdiğinde yönetici formu bu
kayıtları dolu oyuncu ve sayı alanlarıyla açar. “Oyuncu başına asist toplamı”
seçeneğiyle oyuncu eklenebilir, değiştirilebilir, sayı düzenlenebilir veya
kayıt kaldırılabilir. “Her gol için asist seç” seçeneği eski gol bazlı
manuel girişi korur; kaynağın doğrulamadığı gol-asist eşleştirmesi üretilmez.

Maçta kayıtlı golcü ve asistçiler, kadro listesi eski veya boş olsa da oyuncu
seçeneklerine eklenir. Sonucu Kaydet/Güncelle, seçilen asist giriş biçimini
aynı sonuç API'si üzerinden kaydeder. Kaydedilen tek veri tahmin ekranında,
yönetici formunda ve asist krallığında kullanılır. Asist toplamları takım
ve gol sayılarıyla sunucuda doğrulanır. Değişmemiş form canlı kaynakla
senkronize olur; kaydedilmemiş yönetici düzenlemesi korunur.
