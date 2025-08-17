import os
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes

def generate_key() -> bytes:
    """
    Generates a random 32-byte (256-bit) AES key.
    """
    return get_random_bytes(32)

def encrypt_data(data: bytes, key: bytes) -> bytes:
    """
    Encrypts data with AES-256-CBC.
    Returns IV + ciphertext.
    """
    cipher = AES.new(key, AES.MODE_CBC)
    ct = cipher.encrypt(pad(data, AES.block_size))
    return cipher.iv + ct

def decrypt_data(data: bytes, key: bytes) -> bytes:
    """
    Decrypts AES-256-CBC data (IV + ciphertext).
    """
    iv, ct = data[:16], data[16:]
    cipher = AES.new(key, AES.MODE_CBC, iv=iv)
    return unpad(cipher.decrypt(ct), AES.block_size)

def encrypt_file(filepath: str, key: bytes):
    with open(filepath, 'rb') as f:
        plaintext = f.read()
    encrypted = encrypt_data(plaintext, key)
    with open(filepath, 'wb') as f:
        f.write(encrypted)

def decrypt_file(filepath: str, key: bytes):
    with open(filepath, 'rb') as f:
        ciphertext = f.read()
    decrypted = decrypt_data(ciphertext, key)
    with open(filepath, 'wb') as f:
        f.write(decrypted)
