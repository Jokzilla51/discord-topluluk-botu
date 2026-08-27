# Vyron Discord Topluluk Botu v2.1

Discord.js v14 tabanlı; ticket, klan başvurusu, moderasyon, çekiliş, anket, yetkili istatistiği, seviye, güvenlik ve OCR ile YouTube abonelik kontrolünü tek botta birleştiren topluluk botu.

## v2.1 ile düzeltilen önemli sorunlar

- XP ve `guvenlik-modu` artık her veri kaydında silinmiyor.
- JSON verisi geçici dosya + yeniden adlandırma yöntemiyle güvenli kaydediliyor; yeni alanlar şema dönüşümünde korunuyor.
- Aktif çekilişler, katılımcılar, anket oyları, duyuru onayları, AFK kayıtları ve ticket üstlenmeleri yeniden başlatmadan sonra geri yükleniyor.
- Uzun çekilişlerde Node.js zamanlayıcı taşması önlendi.
- Ticket kapatma işlemi yalnızca talep sahibi veya yetkili tarafından yapılabiliyor.
- Ticket sahibi kanal konusuna ve veri deposuna kaydediliyor; kapanan ticket kayıtları temizleniyor.
- Tag şartı tekrar gerçek rol/tag kontrolü yapıyor; artık koşulsuz `true` değil.
- `/tag-ayarla` ve `/tag-tara` eklendi. Tarama yalnızca Klan Üyesi, Has Klan Üyesi ve Yetkili kadrosunu kontrol eder; normal üyeleri dışarıda bırakır.
- `/tag-tara`, `ϟVYRN` tagını takanları ve takmayanları ayrı listeler. Yönetici isterse sonuçtaki butonla tagı olmayanlara DM uyarısı gönderir; butona basılmadan mesaj gönderilmez ve hiçbir rol otomatik değiştirilmez.
- Ses mesaisi bütün üyeler yerine yalnızca yetkililer için tutuluyor.
- Yetkili sıralaması, denetimi ve bireysel raporlarında günlük/haftalık/toplam sayaçlar artık birbirinin yerine kullanılmıyor; gerçek `0` değerleri korunuyor.
- Sunucudan ayrılmış ya da artık yetkili olmayan eski istatistik sahipleri sıralama ve denetime alınmıyor.
- `mod` metnini içeren “model/modern” gibi alakasız rollerin yetkili sayılmasına yol açan rol eşleşmesi düzeltildi.
- Kalabalık yetkili listelerinin Discord embed sınırını aşarak komutu bozması önlendi.
- Raid, spam, XP bekleme ve AFK anahtarları sunucu bazında ayrıldı.
- Bot açılır açılmaz izinsiz rol/kanal oluşturma kaldırıldı. Otomatik kurulum yalnızca komutla veya açıkça etkinleştirildiğinde çalışır.
- Komutlar her sunucuya tek tek basılmak yerine global veya seçili geliştirme sunucusu kapsamıyla kaydediliyor.
- Hatalı etkileşimlerde kullanıcı artık “uygulama yanıt vermedi” ekranında bırakılmıyor.
- `/healthz` gerçek Discord bağlantı durumunu döndürüyor.
- Discord yedeği 2.000 karakterlik mesaj sınırına takılmaması için JSON dosya eki kullanıyor ve varsayılan olarak kapalı geliyor.

## Gereksinimler

- Node.js 22.13 veya daha yeni (Node.js 24 önerilir)
- Discord bot tokenı
- Developer Portal'da `Server Members Intent` ve `Message Content Intent`
- Bot için `bot` ve `applications.commands` OAuth kapsamları

OCR, ticket ve moderasyon özelliklerinin tamamı için botun kanal/rol yönetimi, mesaj okuma-gönderme, mesaj yönetme, üye susturma/atma/yasaklama izinlerine ihtiyacı vardır. Bot rolü, yönetmesi gereken rollerin üzerinde bulunmalıdır.

## Kurulum

```bash
npm ci
copy .env.example .env
npm start
```

Linux/macOS üzerinde ikinci komut `cp .env.example .env` şeklindedir. `.env` içindeki `TOKEN` değerini doldurun; bu dosyayı Git'e eklemeyin.

Geliştirme sırasında komutları tek sunucuya anında yüklemek için:

```env
COMMAND_SCOPE=guild
GUILD_ID=SUNUCU_ID
```

Üretimde önerilen ayar:

```env
COMMAND_SCOPE=global
AUTO_SETUP_ON_READY=false
DISCORD_BACKUP_ENABLED=false
```

Global komut değişikliklerinin Discord'da görünmesi biraz zaman alabilir. İlk kurulumu bilinçli şekilde yapmak için `/otomatik-kurulum` komutunu kullanın.

## Kontroller

```bash
npm run check
```

Bu komut sözdizimi kontrolünü, ESLint'i ve Node testlerini çalıştırır. Testler gerçek Discord tokenı gerektirmez.

## Komut grupları

- Destek: `/ticket-kur`, `/ticket-kategori`, `/ticket-yetkili`
- Klan başvurusu: `/basvuru-kur`, `/basvuru-kategori`, `/basvuru-yetkili`, `/klan-rutbe`, `/hile-rapor`
- Etkinlik: `/cekilis`, `/reroll`, `/anket`, `/turnuva-duyuru`, `/duyuru`
- Moderasyon: `/mute`, `/unmute`, `/kick`, `/ban`, `/sil`, `/kilit`, `/yavas-mod`, `/sicil`
- Yetkili yönetimi: `/yetkili-siralama`, `/yetkili-siralama-kur`, `/yetkili-denetim`, `/yetkili-inaktif`, `/yetkili-rapor`, `/yetkili-terfi`, `/gunluk-rapor`
- Topluluk: `/seviye`, `/top-seviye`, `/afk`, `/dogrulama-kur`, `/bildirim-rol-kur`, `/haftanin-oyuncusu`, `/tag-ayarla`, `/tag-tara`
- Sistem: `/yardim`, `/sunucu-analiz`, `/sunucu-bilgi`, `/sunucu-istatistik`, `/kullanici-bilgi`, `/guvenlik-modu`, `/otomatik-kurulum`
- Abone/OCR: `/abone-kur`, `/abone-kanal`

Bot toplam 46 slash komutu kaydeder. Komutların seçenekleri ve gerekli yetkileri Discord komut arayüzünde gösterilir.

## Kalıcı veri ve yedekleme

Çalışma verileri `bot_data.json` dosyasındadır ve Git tarafından yok sayılır. Kalıcı disk sunmayan bir platform kullanıyorsanız `DISCORD_BACKUP_ENABLED=true` ile botun yalnızca kendisinin görebildiği yedek kanalını etkinleştirebilirsiniz. Bu seçenek botun kanal oluşturmasına izin verir; varsayılan olarak kapalıdır.

Render dağıtımı için depodaki `render.yaml` kullanılabilir. `TOKEN` gizli ortam değişkeni olarak eklenmelidir. Sağlık kontrolü yolu `/healthz`'dir.

## Güvenlik notları

- Bot tokenını hiçbir zaman kodun içine yazmayın veya GitHub'a göndermeyin.
- Yönetici izni en kolay kurulumdur fakat zorunlu değildir; mümkünse yalnızca gereken izinleri verin.
- Otomatik kurulum mevcut isimleri eşleştirir. Üretim sunucusunda çalıştırmadan önce rol ve kanal yedeği almak iyi fikirdir.
- OCR görüntü işleme CPU tüketir. Yoğun sunucularda abone kanalı dışında kullanılmamalıdır.

## Lisans

Bu depoda ayrı bir lisans dosyası yoktur. Açık kaynak olarak yeniden dağıtmayı planlıyorsanız uygun bir `LICENSE` dosyası ekleyin.
