package session

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// encryptionKey 存储AES加密密钥
var encryptionKey []byte

// keyInitialized 标记密钥是否已初始化
var keyInitialized bool

// InitEncryption 初始化加密模块
// 从配置目录加载或生成加密密钥
func InitEncryption(configDir string) error {
	keyPath := filepath.Join(configDir, ".enc_key")

	// 检查密钥文件是否存在
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		// 生成新的32字节AES密钥
		key := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return errors.New("failed to generate encryption key: " + err.Error())
		}

		// 保存密钥文件，权限设置为仅用户可读
		if err := os.WriteFile(keyPath, key, 0600); err != nil {
			return errors.New("failed to save encryption key: " + err.Error())
		}

		encryptionKey = key
	} else {
		// 加载现有密钥
		key, err := os.ReadFile(keyPath)
		if err != nil {
			return errors.New("failed to load encryption key: " + err.Error())
		}

		// 验证密钥长度
		if len(key) != 32 {
			return errors.New("invalid encryption key length, expected 32 bytes")
		}

		encryptionKey = key
	}

	keyInitialized = true
	return nil
}

// Encrypt 使用AES-GCM加密字符串
// 返回Base64编码的加密数据（包含nonce）
func Encrypt(plaintext string) string {
	if !keyInitialized || len(plaintext) == 0 {
		return plaintext // 未初始化或空字符串，返回原值
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return plaintext // 加密失败，返回原值（不影响功能）
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return plaintext
	}

	// 生成随机nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plaintext
	}

	// 加密数据
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)

	// 将nonce和ciphertext组合，然后Base64编码
	combined := append(nonce, ciphertext...)
	return base64.StdEncoding.EncodeToString(combined)
}

// Decrypt 使用AES-GCM解密字符串
// 输入为Base64编码的加密数据（包含nonce）
func Decrypt(ciphertext string) string {
	if !keyInitialized || len(ciphertext) == 0 {
		return ciphertext // 未初始化或空字符串，返回原值
	}

	// 检查是否是加密数据（Base64编码后的特征）
	// 如果不是有效的Base64或解密失败，可能是未加密的旧数据
	decoded, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return ciphertext // 不是Base64，可能是明文旧数据
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return ciphertext
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ciphertext
	}

	nonceSize := gcm.NonceSize()
	if len(decoded) < nonceSize {
		return ciphertext // 数据太短，不是有效加密数据
	}

	// 分离nonce和ciphertext
	nonce := decoded[:nonceSize]
	actualCiphertext := decoded[nonceSize:]

	// 解密
	plaintext, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return ciphertext // 解密失败，返回原值（可能是明文旧数据）
	}

	return string(plaintext)
}

// IsEncrypted 检查字符串是否已加密
func IsEncrypted(s string) bool {
	if !keyInitialized || len(s) == 0 {
		return false
	}

	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return false
	}

	// AES-GCM nonce大小为12字节，加上至少一个字节的ciphertext
	// 最小长度应该是 nonceSize + 16 (GCM tag)
	if len(decoded) < 28 {
		return false
	}

	return true
}