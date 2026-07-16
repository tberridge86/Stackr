import SwiftUI

// Expected Xcode asset names:
// stackr_wordmark, stackr_icon, blob_purple, blob_light_purple,
// blob_orange, sparkle_gold, double_star_gold
//
// If your Assets.xcassets names differ, update the Image("...") references below.

struct StackrSplashView: View {
    var slogan: String = "Collect. Store. Protect."
    var duration: TimeInterval = 2.1
    var onFinished: () -> Void = {}

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var float = false
    @State private var twinkle = false
    @State private var progress = false

    private var backgroundColor: Color {
        colorScheme == .dark ? Color(red: 0.05, green: 0.06, blue: 0.13) : Color(red: 0.985, green: 0.98, blue: 1.0)
    }

    private var navy: Color {
        colorScheme == .dark ? Color.white.opacity(0.92) : Color(red: 0.02, green: 0.10, blue: 0.27)
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let minSide = min(size.width, size.height)
            let logoWidth = min(size.width * 0.62, 270)
            let iconSize = min(minSide * 0.28, 136)
            let verticalOffset = -size.height * 0.055

            ZStack {
                backgroundColor.ignoresSafeArea()

                FloatingBlobView(
                    assetName: "blob_light_purple",
                    size: minSide * 0.92,
                    opacity: colorScheme == .dark ? 0.14 : 0.22,
                    float: float,
                    xShift: 10,
                    yShift: -14
                )
                .position(x: size.width * 0.88, y: size.height * 0.13)

                FloatingBlobView(
                    assetName: "blob_purple",
                    size: minSide * 0.95,
                    opacity: colorScheme == .dark ? 0.24 : 0.78,
                    float: float,
                    xShift: -14,
                    yShift: 12
                )
                .position(x: -size.width * 0.03, y: size.height * 0.93)

                FloatingBlobView(
                    assetName: "blob_orange",
                    size: minSide * 0.84,
                    opacity: colorScheme == .dark ? 0.20 : 0.88,
                    float: float,
                    xShift: 13,
                    yShift: 10
                )
                .position(x: size.width * 0.96, y: size.height * 0.97)

                PremiumSparkleField(size: size, twinkle: twinkle)

                VStack(spacing: max(12, size.height * 0.018)) {
                    VStack(spacing: max(8, size.height * 0.012)) {
                        Image("stackr_icon")
                            .resizable()
                            .scaledToFit()
                            .frame(width: iconSize, height: iconSize)
                            .shadow(color: Color.purple.opacity(colorScheme == .dark ? 0.30 : 0.16), radius: 18, y: 9)

                        Image("stackr_wordmark")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: logoWidth)
                    }
                    .scaleEffect(appeared ? 1.0 : 0.92)
                    .opacity(appeared ? 1.0 : 0.0)
                    .offset(y: appeared ? 0 : 14)

                    Text(slogan)
                        .font(.system(size: max(18, min(size.width * 0.063, 28)), weight: .medium, design: .rounded))
                        .kerning(0.15)
                        .foregroundStyle(navy.opacity(colorScheme == .dark ? 0.86 : 0.88))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .padding(.horizontal, 24)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)

                    HStack(spacing: 14) {
                        SparkleView(assetName: "double_star_gold", size: 30, twinkle: twinkle, delay: 0.0)
                        SparkleView(assetName: "double_star_gold", size: 30, twinkle: twinkle, delay: 0.28)
                    }
                    .padding(.top, 3)
                    .opacity(appeared ? 1 : 0)

                    LoadingShimmerBar(progress: progress)
                        .frame(width: min(size.width * 0.34, 156), height: 5)
                        .padding(.top, 12)
                        .opacity(appeared ? 1 : 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .offset(y: verticalOffset)
                .padding(.horizontal, 28)
                .padding(.top, proxy.safeAreaInsets.top)
                .padding(.bottom, proxy.safeAreaInsets.bottom)
            }
            .onAppear {
                startAnimation()
            }
        }
    }

    private func startAnimation() {
        if reduceMotion {
            withAnimation(.easeInOut(duration: 0.28)) {
                appeared = true
                progress = true
            }
        } else {
            withAnimation(.spring(response: 0.72, dampingFraction: 0.78, blendDuration: 0.08)) {
                appeared = true
            }
            withAnimation(.easeInOut(duration: 4.2).repeatForever(autoreverses: true)) {
                float = true
            }
            withAnimation(.easeInOut(duration: 1.35).repeatForever(autoreverses: true)) {
                twinkle = true
            }
            withAnimation(.easeInOut(duration: duration * 0.82).delay(0.2)) {
                progress = true
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(.easeInOut(duration: 0.32)) {
                onFinished()
            }
        }
    }
}

struct FloatingBlobView: View {
    let assetName: String
    let size: CGFloat
    let opacity: Double
    let float: Bool
    let xShift: CGFloat
    let yShift: CGFloat

    var body: some View {
        Image(assetName)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .opacity(opacity)
            .blur(radius: 0.25)
            .offset(x: float ? xShift : -xShift * 0.35, y: float ? yShift : -yShift * 0.35)
            .accessibilityHidden(true)
    }
}

struct SparkleView: View {
    let assetName: String
    let size: CGFloat
    let twinkle: Bool
    var delay: Double = 0

    var body: some View {
        Image(assetName)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .scaleEffect(twinkle ? 1.06 : 0.94)
            .opacity(twinkle ? 1.0 : 0.72)
            .shadow(color: Color.orange.opacity(twinkle ? 0.34 : 0.16), radius: twinkle ? 11 : 5)
            .animation(.easeInOut(duration: 1.25).delay(delay).repeatForever(autoreverses: true), value: twinkle)
            .accessibilityHidden(true)
    }
}

private struct PremiumSparkleField: View {
    let size: CGSize
    let twinkle: Bool

    var body: some View {
        ZStack {
            SparkleView(assetName: "sparkle_gold", size: 18, twinkle: twinkle, delay: 0.1)
                .position(x: size.width * 0.18, y: size.height * 0.70)

            SparkleView(assetName: "sparkle_gold", size: 13, twinkle: twinkle, delay: 0.42)
                .position(x: size.width * 0.78, y: size.height * 0.22)

            Circle()
                .fill(Color.purple.opacity(twinkle ? 0.68 : 0.34))
                .frame(width: 8, height: 8)
                .position(x: size.width * 0.74, y: size.height * 0.79)

            Circle()
                .fill(Color.orange.opacity(twinkle ? 0.78 : 0.42))
                .frame(width: 10, height: 10)
                .position(x: size.width * 0.88, y: size.height * 0.71)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct LoadingShimmerBar: View {
    let progress: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color(red: 0.40, green: 0.28, blue: 1.0).opacity(0.14))

                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.36, green: 0.20, blue: 1.0),
                                Color(red: 0.68, green: 0.36, blue: 1.0),
                                Color(red: 1.0, green: 0.70, blue: 0.08)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: progress ? proxy.size.width : proxy.size.width * 0.18)
                    .shadow(color: Color.purple.opacity(0.20), radius: 8, y: 2)

                Capsule()
                    .fill(Color.white.opacity(0.45))
                    .frame(width: proxy.size.width * 0.22)
                    .offset(x: progress ? proxy.size.width * 0.88 : -proxy.size.width * 0.24)
                    .blur(radius: 3)
            }
            .clipShape(Capsule())
        }
        .accessibilityLabel("Loading Stackr")
    }
}

// MARK: - Integration Example

struct StackrSplashGate<MainContent: View>: View {
    let mainContent: MainContent
    @State private var showSplash = true

    init(@ViewBuilder mainContent: () -> MainContent) {
        self.mainContent = mainContent()
    }

    var body: some View {
        ZStack {
            mainContent
                .opacity(showSplash ? 0 : 1)
                .scaleEffect(showSplash ? 0.985 : 1)

            if showSplash {
                StackrSplashView {
                    showSplash = false
                }
                .transition(.opacity.combined(with: .scale(scale: 1.01)))
                .zIndex(1)
            }
        }
        .animation(.easeInOut(duration: 0.34), value: showSplash)
    }
}

// Example usage in a SwiftUI app shell:
//
// @main
// struct StackrApp: App {
//     var body: some Scene {
//         WindowGroup {
//             StackrSplashGate {
//                 MainAppView()
//             }
//         }
//     }
// }
//
// struct MainAppView: View {
//     var body: some View {
//         Text("Stackr app")
//     }
// }

#Preview {
    StackrSplashView(duration: 3.0)
}
