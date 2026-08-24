# 🤖 Hepsi Bir Arada Discord Botu (Ticket + Çekiliş + Doğrulama)

Render.com üzerinde 7/24 Web Service olarak çalışmaya hazır, modern **Discord.js v14** tabanlı topluluk yönetim botu.

---

## ✨ Özellikler

- 🎫 **Destek (Ticket) Sistemi:** Butonlu panel kurulumu (`/ticket-kur`), kullanıcıya özel otomatik kanal açma, yetkili rollerine izin verme, tek tıkla talep kapatma.
- 🎉 **Çekiliş (Giveaway) Sistemi:** Kolay slash komutu (`/cekilis`), süre geri sayımı, katılımcı sayacı olan buton, süre sonunda otomatik rastgele kazanan seçimi ve tebrik mesajı.
- 🛡️ **Doğrulama (Verification) Sistemi:** Sunucuya giren üyeler için güvenlik butonu (`/dogrulama-kur`), tek tıkla rol tanımlama.
- 🌐 **Render 7/24 Uyumlu:** Yerleşik Express HTTP web sunucusu sayesinde Render Web Service üzerinde kapanmadan kesintisiz çalışır.

---

## 🛠️ 1. Discord Developer Portal Ayarları

1. [Discord Developer Portal](https://discord.com/developers/applications) adresine gidin.
2. **New Application** butonuna basarak bir isim verin (Örn: `Topluluk Botu`).
3. Sol menüden **Bot** sekmesine geçin:
   - **Reset Token** butonuna basarak Token'ınızı kopyalayın (bunu kimseyle paylaşmayın!).
   - Sayfayı biraz aşağı kaydırıp **Privileged Gateway Intents** altındaki şu 3 ayarı açın (Açık/Mavi yapın):
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
   - **Save Changes** diyerek kaydedin.
4. Sol menüden **OAuth2** > **URL Generator** sekmesine gelin:
   - Scopes: `bot`, `applications.commands` seçin.
   - Bot Permissions: `Administrator` (veya Manage Channels, Manage Roles, Send Messages, Embed Links vb.) seçin.
   - En altta çıkan linki kopyalayıp tarayıcınızda açarak botu Discord sunucunuza davet edin.

---

## 🚀 2. Render.com Üzerine Kurulum (7/24 Yayına Alma)

1. Projeyi bir GitHub reponuza yükleyin (veya GitHub hesabınıza bağlayın).
2. [dashboard.render.com](https://dashboard.render.com) adresine girin.
3. **New +** > **Web Service** seçeneğine tıklayın.
4. GitHub reponuzu seçin:
   - **Name:** `topluluk-botu` (veya istediğiniz bir isim)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** `Free`
5. Aşağıdaki **Environment Variables** bölümüne:
   - `TOKEN` = *(Discord'dan kopyaladığınız Bot Token'ı)*
6. **Deploy Web Service** butonuna tıklayın!

> 💡 **7/24 Uyanık Tutma İpucu:** Render ücretsiz planı 15 dakika istek almayınca uyku moduna geçer. Render'ın size verdiği URL'yi (Örn: `https://topluluk-botu.onrender.com`) [UptimeRobot.com](https://uptimerobot.com) gibi ücretsiz bir izleme sitesine HTTP Monitor (her 5 dakikada bir ping) olarak eklerseniz botunuz hiç kapanmadan 7/24 çalışır!

---

## 📖 3. Komutlar & Kullanım

| Komut | Açıklama | Örnek Kullanım |
|---|---|---|
| `/yardim` | Botun tüm sistemlerini ve yardım rehberini gösterir. | `/yardim` |
| `/ticket-kur` | Belirtilen kanala butonlu destek paneli kurar. | `/ticket-kur kanal:#destek yetkili_rol:@DestekEkibi` |
| `/cekilis` | Süreli ve ödüllü çekiliş başlatır. | `/cekilis sure:10m odul:Discord Nitro kazanan_sayisi:1` |
| `/dogrulama-kur` | Yeni üyeler için butonlu doğrulama paneli kurar. | `/dogrulama-kur kanal:#dogrulama verilecek_rol:@Uye` |

---

## 💻 4. Yerelde (Kendi Bilgisayarınızda) Çalıştırma

```bash
# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun ve TOKEN'ınızı yazın
# TOKEN=bot_tokeniniz

# Botu başlatın
npm start
```
