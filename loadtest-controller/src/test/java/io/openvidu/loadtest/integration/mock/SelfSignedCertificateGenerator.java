package io.openvidu.loadtest.integration.mock;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Security;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

/**
 * Utility class for generating self-signed X.509 certificates.
 * Used by mock servers for HTTPS testing.
 */
public class SelfSignedCertificateGenerator {

    public static final String KEY_PASSWORD = "testpassword";
    private static final String ALGORITHM = "RSA";
    private static final int KEY_SIZE = 2048;
    private static final int VALIDITY_DAYS = 365;
    private static final String BC_PROVIDER = "BC";

    static {
        // Register Bouncy Castle provider if not already registered
        if (Security.getProvider(BC_PROVIDER) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    /**
     * Generate a self-signed X.509 certificate.
     */
    public static X509Certificate generateCertificate() throws Exception {
        // Generate key pair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance(ALGORITHM);
        keyPairGenerator.initialize(KEY_SIZE, new SecureRandom());
        KeyPair keyPair = keyPairGenerator.generateKeyPair();

        // Certificate builder
        X500Name issuer = new X500Name("CN=LoadTest Mock Server, O=OpenVidu, L=Granada, C=ES");
        X500Name subject = new X500Name("CN=localhost, O=OpenVidu, L=Granada, C=ES");
        BigInteger serial = BigInteger.valueOf(new SecureRandom().nextLong() & Long.MAX_VALUE);
        Date notBefore = new Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000); // Yesterday
        Date notAfter = new Date(System.currentTimeMillis() + VALIDITY_DAYS * 24L * 60 * 60 * 1000); // +1 year

        SubjectPublicKeyInfo subjectPublicKeyInfo = SubjectPublicKeyInfo.getInstance(keyPair.getPublic().getEncoded());

        X509v3CertificateBuilder certBuilder = new X509v3CertificateBuilder(
                issuer, serial, notBefore, notAfter, subject, subjectPublicKeyInfo);

        // Sign the certificate
        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA")
                .setProvider(BC_PROVIDER)
                .build(keyPair.getPrivate());

        X509CertificateHolder certHolder = certBuilder.build(signer);

        // Convert to X509Certificate
        return new JcaX509CertificateConverter()
                .setProvider(BC_PROVIDER)
                .getCertificate(certHolder);
    }

    /**
     * Create a KeyStore containing the self-signed certificate and private key.
     */
    public static KeyStore createKeyStore(X509Certificate certificate) throws Exception {
        // Generate a new key pair for the key store
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance(ALGORITHM);
        keyPairGenerator.initialize(KEY_SIZE, new SecureRandom());
        KeyPair keyPair = keyPairGenerator.generateKeyPair();

        // Create certificate with this key pair
        X509Certificate cert = generateCertificateWithKey(keyPair);

        // Create key store
        KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
        keyStore.load(null, null);
        keyStore.setKeyEntry("alias", keyPair.getPrivate(), KEY_PASSWORD.toCharArray(),
                new java.security.cert.Certificate[] { cert });

        return keyStore;
    }

    /**
     * Generate a self-signed certificate using the provided key pair.
     */
    private static X509Certificate generateCertificateWithKey(KeyPair keyPair) throws Exception {
        X500Name issuer = new X500Name("CN=LoadTest Mock Server, O=OpenVidu, L=Granada, C=ES");
        X500Name subject = new X500Name("CN=localhost, O=OpenVidu, L=Granada, C=ES");
        BigInteger serial = BigInteger.valueOf(new SecureRandom().nextLong() & Long.MAX_VALUE);
        Date notBefore = new Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000);
        Date notAfter = new Date(System.currentTimeMillis() + VALIDITY_DAYS * 24L * 60 * 60 * 1000);

        SubjectPublicKeyInfo subjectPublicKeyInfo = SubjectPublicKeyInfo.getInstance(keyPair.getPublic().getEncoded());

        X509v3CertificateBuilder certBuilder = new X509v3CertificateBuilder(
                issuer, serial, notBefore, notAfter, subject, subjectPublicKeyInfo);

        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA")
                .setProvider(BC_PROVIDER)
                .build(keyPair.getPrivate());

        X509CertificateHolder certHolder = certBuilder.build(signer);

        return new JcaX509CertificateConverter()
                .setProvider(BC_PROVIDER)
                .getCertificate(certHolder);
    }

    /**
     * Create an SSL context configured with the self-signed certificate.
     */
    public static javax.net.ssl.SSLContext createSSLContext() throws Exception {
        X509Certificate certificate = generateCertificate();
        KeyStore keyStore = createKeyStore(certificate);

        javax.net.ssl.KeyManagerFactory kmf = javax.net.ssl.KeyManagerFactory.getInstance(
                javax.net.ssl.KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, KEY_PASSWORD.toCharArray());

        javax.net.ssl.SSLContext sslContext = javax.net.ssl.SSLContext.getInstance("TLS");
        sslContext.init(kmf.getKeyManagers(), null, new SecureRandom());

        return sslContext;
    }
}
