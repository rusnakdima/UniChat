#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        ::log::info!($($arg)*)
    };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        ::log::debug!($($arg)*)
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        ::log::error!($($arg)*)
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        ::log::warn!($($arg)*)
    };
}
